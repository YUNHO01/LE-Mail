import * as crypto from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  Department,
  Domain,
  Mailbox,
  OrgSyncLog,
  SystemSetting,
  User,
} from '../database/entities';
import {
  RestartLevel,
  SettingCategory,
  TargetModule,
  UserRole,
} from '@lemail/shared-types';
import { LicenseService } from '../license/license.service';
import { MailFolderService } from '../mail-folder/mail-folder.service';
import { MailboxCacheService } from '../smtp-ingestion/mailbox-cache.service';
import {
  AmsDepartmentPayloadDto,
  AmsEmployeePayloadDto,
  SyncAmsOrgDto,
  UpdateAmsSyncSettingsDto,
} from './dto/ams-sync.dto';

export interface AmsSyncSettingsDto {
  enabled: boolean;
  apiUrl: string;
  departmentsApiUrl: string;
  usersApiUrl: string;
  hasApiToken: boolean;
  intervalMinutes: number;
  autoProvisionMailbox: boolean;
}

const AMS_SETTING_KEYS = {
  ENABLED: 'ams.integration.enabled',
  API_URL: 'ams.api.url',
  DEPARTMENTS_API_URL: 'ams.api.departments_url',
  USERS_API_URL: 'ams.api.users_url',
  API_TOKEN: 'ams.api.token',
  INTERVAL_MINUTES: 'ams.sync.interval_minutes',
  AUTO_PROVISION: 'ams.sync.auto_provision_mailbox',
} as const;

@Injectable()
export class OrgSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrgSyncService.name);
  private syncTimer: NodeJS.Timeout | null = null;
  private isSyncRunning = false;

  constructor(
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(OrgSyncLog)
    private readonly syncLogRepo: Repository<OrgSyncLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Mailbox)
    private readonly mailboxRepo: Repository<Mailbox>,
    @InjectRepository(Domain)
    private readonly domainRepo: Repository<Domain>,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
    private readonly licenseService: LicenseService,
    private readonly mailFolderService: MailFolderService,
    private readonly mailboxCacheService: MailboxCacheService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.refreshScheduler();
  }

  onModuleDestroy() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  async getSyncSettings(): Promise<AmsSyncSettingsDto> {
    const keys = Object.values(AMS_SETTING_KEYS);
    const rows = await this.settingRepo
      .createQueryBuilder('s')
      .where('s.key IN (:...keys)', { keys })
      .getMany();
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const intervalRaw = Number(map.get(AMS_SETTING_KEYS.INTERVAL_MINUTES) || 60);
    return {
      enabled: map.get(AMS_SETTING_KEYS.ENABLED) === 'true',
      apiUrl: map.get(AMS_SETTING_KEYS.API_URL) || '',
      departmentsApiUrl: map.get(AMS_SETTING_KEYS.DEPARTMENTS_API_URL) || '',
      usersApiUrl: map.get(AMS_SETTING_KEYS.USERS_API_URL) || '',
      hasApiToken: Boolean(map.get(AMS_SETTING_KEYS.API_TOKEN)),
      intervalMinutes: Number.isFinite(intervalRaw) && intervalRaw >= 5 ? intervalRaw : 60,
      autoProvisionMailbox: map.get(AMS_SETTING_KEYS.AUTO_PROVISION) !== 'false',
    };
  }

  async updateSyncSettings(dto: UpdateAmsSyncSettingsDto): Promise<AmsSyncSettingsDto> {
    if (dto.enabled !== undefined) {
      await this.upsertSetting(
        AMS_SETTING_KEYS.ENABLED,
        String(dto.enabled),
        'boolean',
        false,
        'AMS 조직도 자동 동기화 활성화 여부',
      );
    }
    if (dto.apiUrl !== undefined) {
      await this.upsertSetting(
        AMS_SETTING_KEYS.API_URL,
        dto.apiUrl.trim(),
        'string',
        false,
        'AMS 조직도 공통 Base URL',
      );
    }
    if (dto.departmentsApiUrl !== undefined) {
      await this.upsertSetting(
        AMS_SETTING_KEYS.DEPARTMENTS_API_URL,
        dto.departmentsApiUrl.trim(),
        'string',
        false,
        'AMS 부서 조회 엔드포인트 URL 또는 경로',
      );
    }
    if (dto.usersApiUrl !== undefined) {
      await this.upsertSetting(
        AMS_SETTING_KEYS.USERS_API_URL,
        dto.usersApiUrl.trim(),
        'string',
        false,
        'AMS 사용자 조회 엔드포인트 URL 또는 경로',
      );
    }
    if (dto.apiToken !== undefined && dto.apiToken.trim().length > 0) {
      await this.upsertSetting(
        AMS_SETTING_KEYS.API_TOKEN,
        dto.apiToken.trim(),
        'string',
        true,
        'AMS API 인증 토큰',
      );
    }
    if (dto.intervalMinutes !== undefined) {
      const safeInterval = Math.max(5, Math.min(1440, Number(dto.intervalMinutes) || 60));
      await this.upsertSetting(
        AMS_SETTING_KEYS.INTERVAL_MINUTES,
        String(safeInterval),
        'number',
        false,
        'AMS 조직도 자동 동기화 주기(분)',
      );
    }
    if (dto.autoProvisionMailbox !== undefined) {
      await this.upsertSetting(
        AMS_SETTING_KEYS.AUTO_PROVISION,
        String(dto.autoProvisionMailbox),
        'boolean',
        false,
        '신규 입사자 LEMail 사서함 자동 생성 여부',
      );
    }

    await this.refreshScheduler();
    return this.getSyncSettings();
  }

  private async upsertSetting(
    key: string,
    value: string,
    valueType: 'string' | 'number' | 'boolean' | 'json',
    isSecret: boolean,
    description: string,
  ): Promise<void> {
    let row = await this.settingRepo.findOne({ where: { key } });
    if (!row) {
      row = this.settingRepo.create({
        category: SettingCategory.SERVER,
        key,
        value,
        valueType,
        isEncrypted: false,
        isSecret,
        restartRequired: RestartLevel.NONE,
        targetModule: TargetModule.API_SERVER,
        description,
      });
    } else {
      row.value = value;
      row.valueType = valueType;
      row.isSecret = isSecret;
    }
    await this.settingRepo.save(row);
  }

  private isFullHttpUrl(url: string): boolean {
    return /^https?:\/\//i.test(url.trim());
  }

  private hasValidSyncEndpoints(settings: AmsSyncSettingsDto): boolean {
    if (settings.apiUrl?.trim()) return true;
    return (
      this.isFullHttpUrl(settings.departmentsApiUrl || '') &&
      this.isFullHttpUrl(settings.usersApiUrl || '')
    );
  }

  private resolveEndpointUrl(
    baseUrl: string,
    overrideUrl: string,
    defaultPath: string,
  ): string {
    const trimmedOverride = (overrideUrl || '').trim();
    if (trimmedOverride) {
      if (this.isFullHttpUrl(trimmedOverride)) {
        return trimmedOverride;
      }
      if (!baseUrl) {
        throw new BadRequestException(
          `상대 경로(${trimmedOverride})를 사용하려면 공통 Base URL이 필요합니다.`,
        );
      }
      const normalizedPath = trimmedOverride.startsWith('/')
        ? trimmedOverride
        : `/${trimmedOverride}`;
      return `${baseUrl}${normalizedPath}`;
    }
    if (!baseUrl) {
      throw new BadRequestException('AMS 조직도 API URL이 설정되어 있지 않습니다.');
    }
    return `${baseUrl}${defaultPath}`;
  }

  private async refreshScheduler(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    try {
      const settings = await this.getSyncSettings();
      if (!settings.enabled || !this.hasValidSyncEndpoints(settings)) {
        return;
      }

      const intervalMs = settings.intervalMinutes * 60 * 1000;
      this.syncTimer = setInterval(() => {
        this.pullAndSyncFromAms().catch((err) => {
          this.logger.warn(`Scheduled AMS org sync failed: ${err?.message}`);
        });
      }, intervalMs);

      this.logger.log(
        `AMS organization sync scheduler enabled (every ${settings.intervalMinutes} min -> ${settings.apiUrl || settings.departmentsApiUrl})`,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to initialize AMS org sync scheduler: ${err?.message}`);
    }
  }

  async pullAndSyncFromAms(): Promise<OrgSyncLog> {
    if (this.isSyncRunning) {
      throw new BadRequestException('이미 AMS 조직도 동기화가 진행 중입니다.');
    }

    const settings = await this.getSyncSettings();
    if (!this.hasValidSyncEndpoints(settings)) {
      throw new BadRequestException(
        'AMS 조직도 API URL 또는 부서/사용자 개별 URL을 설정해 주세요.',
      );
    }

    const tokenRow = await this.settingRepo.findOne({
      where: { key: AMS_SETTING_KEYS.API_TOKEN },
    });
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (tokenRow?.value) {
      // AMS 외부 연동 API는 x-api-key 헤더 사용 (호환용 Bearer 병행)
      headers['x-api-key'] = tokenRow.value;
      headers['Authorization'] = `Bearer ${tokenRow.value}`;
    }

    const baseUrl = settings.apiUrl.trim().replace(/\/+$/, '');
    const deptUrl = this.resolveEndpointUrl(baseUrl, settings.departmentsApiUrl, '/departments');
    const userUrl = this.resolveEndpointUrl(baseUrl, settings.usersApiUrl, '/users');

    this.isSyncRunning = true;
    try {
      const payload = await this.fetchAmsOrgPayload(
        baseUrl,
        deptUrl,
        userUrl,
        headers,
        settings.autoProvisionMailbox,
      );
      return await this.syncFromAmsPayload(payload);
    } finally {
      this.isSyncRunning = false;
    }
  }

  private async fetchAmsOrgPayload(
    baseUrl: string,
    deptUrl: string,
    userUrl: string,
    headers: Record<string, string>,
    autoProvisionMailbox: boolean,
  ): Promise<SyncAmsOrgDto> {
    const [deptRes, userRes] = await Promise.all([
      fetch(deptUrl, { headers }),
      fetch(userUrl, { headers }),
    ]);

    if (deptRes.ok && userRes.ok) {
      const rawDepts = (await deptRes.json()) as any[];
      const rawUsers = (await userRes.json()) as any[];
      return this.mapAmsEntitiesToSyncPayload(rawDepts, rawUsers, autoProvisionMailbox);
    }

    // 커스텀 단일 Export URL로 직접 응답하는 경우 폴백 (baseUrl이 설정된 경우)
    let singleRes: Response | null = null;
    if (baseUrl) {
      singleRes = await fetch(baseUrl, { headers });
      if (singleRes.ok) {
        const payload = (await singleRes.json()) as SyncAmsOrgDto;
        return {
          ...payload,
          syncType: payload.syncType || 'FULL',
          autoProvisionMailbox: payload.autoProvisionMailbox ?? autoProvisionMailbox,
        };
      }
    }

    // 오류 메시지 상세화 (401/403/404 등)
    const primaryErrRes = !deptRes.ok ? deptRes : !userRes.ok ? userRes : singleRes!;
    let detail = '';
    try {
      const errBody = await primaryErrRes.text();
      if (errBody) detail = ` - ${errBody.slice(0, 200)}`;
    } catch {}
    throw new Error(`AMS API 응답 오류 (HTTP ${primaryErrRes.status})${detail}`);
  }

  private mapAmsEntitiesToSyncPayload(
    rawDepts: any[],
    rawUsers: any[],
    autoProvisionMailbox: boolean,
  ): SyncAmsOrgDto {
    const userEmpNoById = new Map<string, string>();
    for (const u of Array.isArray(rawUsers) ? rawUsers : []) {
      if (u?.id && u?.employeeNumber) {
        userEmpNoById.set(u.id, String(u.employeeNumber));
      }
    }

    const departments: AmsDepartmentPayloadDto[] = (Array.isArray(rawDepts) ? rawDepts : [])
      .filter((d) => d && d.id && d.name)
      .map((d) => ({
        amsDeptId: String(d.id),
        code: d.code ? String(d.code) : null,
        parentAmsDeptId: d.parentId ? String(d.parentId) : d.parent?.id ? String(d.parent.id) : null,
        name: String(d.name),
        sortOrder: typeof d.order === 'number' ? d.order : 0,
        managerEmployeeId: d.leaderId ? userEmpNoById.get(d.leaderId) || null : null,
        isActive: d.isActive !== undefined ? Boolean(d.isActive) : true,
      }));

    const normalizeStatus = (raw?: string): 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED' => {
      const s = (raw || 'ACTIVE').toUpperCase();
      if (s === 'RESIGNED' || s === 'RETIRED' || s === 'TERMINATED') return 'RESIGNED';
      if (s === 'ON_LEAVE' || s === 'LEAVE' || s === 'SUSPENDED') return 'ON_LEAVE';
      return 'ACTIVE';
    };

    const employees: AmsEmployeePayloadDto[] = (Array.isArray(rawUsers) ? rawUsers : [])
      .filter((u) => u && u.employeeNumber && u.name)
      .map((u) => ({
        employeeNumber: String(u.employeeNumber),
        amsUserId: u.id ? String(u.id) : null,
        name: String(u.name),
        email: u.email ? String(u.email) : null,
        amsDeptId: u.departmentId
          ? String(u.departmentId)
          : u.departmentEntity?.id
          ? String(u.departmentEntity.id)
          : null,
        departmentCode: u.departmentEntity?.code ? String(u.departmentEntity.code) : null,
        position: u.jobRank?.name ? String(u.jobRank.name) : u.position ? String(u.position) : null,
        jobTitle: u.jobTitle?.name ? String(u.jobTitle.name) : null,
        phone: null,
        mobile: u.phoneNumber ? String(u.phoneNumber) : null,
        employmentStatus: normalizeStatus(u.employmentStatus),
        mailEnabled: true,
      }));

    return {
      syncType: 'FULL',
      autoProvisionMailbox,
      departments,
      employees,
    };
  }

  async getSyncLogs(limit = 20): Promise<OrgSyncLog[]> {
    return this.syncLogRepo.find({
      order: { startedAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async syncFromAmsPayload(dto: SyncAmsOrgDto): Promise<OrgSyncLog> {
    const syncLog = await this.syncLogRepo.save(
      this.syncLogRepo.create({
        syncType: dto.syncType || 'FULL',
        status: 'RUNNING',
      }),
    );

    const errors: string[] = [];
    let createdCount = 0;
    let updatedCount = 0;
    let deactivatedCount = 0;
    let skippedCount = 0;
    let mailboxCacheDirty = false;

    try {
      const now = new Date();
      const deptMapByAmsId = new Map<string, Department>();
      const deptMapByCode = new Map<string, Department>();

      // 기존 부서 캐시 로드
      const existingDepts = await this.departmentRepo.find();
      for (const d of existingDepts) {
        if (d.amsDeptId) deptMapByAmsId.set(d.amsDeptId, d);
        if (d.code) deptMapByCode.set(d.code, d);
      }

      // 1단계: 부서 Upsert 및 계층 연결
      const departments = dto.departments || [];
      if (departments.length > 0) {
        await this.syncDepartments(departments, now, deptMapByAmsId, deptMapByCode);
      }

      // 2단계: 임직원 동기화 (employeeNumber 유니크 키 기반)
      const employees = dto.employees || [];
      const autoProvision = dto.autoProvisionMailbox ?? true;
      const licenseStatus = await this.licenseService.getLicenseStatus();
      let remainingSeats =
        licenseStatus.isValid && licenseStatus.maxUsers
          ? Math.max(0, licenseStatus.maxUsers - (licenseStatus.currentUsers || 0))
          : 0;

      for (const emp of employees) {
        try {
          const result = await this.syncSingleEmployee(
            emp,
            now,
            autoProvision,
            licenseStatus.isValid,
            remainingSeats,
            deptMapByAmsId,
            deptMapByCode,
          );
          if (result.action === 'CREATED') {
            createdCount++;
            remainingSeats = Math.max(0, remainingSeats - 1);
            mailboxCacheDirty = true;
          } else if (result.action === 'UPDATED') {
            updatedCount++;
            if (result.mailboxChanged) mailboxCacheDirty = true;
          } else if (result.action === 'DEACTIVATED') {
            deactivatedCount++;
            if (result.mailboxChanged) mailboxCacheDirty = true;
          } else if (result.action === 'SKIPPED') {
            skippedCount++;
            if (result.reason) errors.push(`${emp.employeeNumber}: ${result.reason}`);
          }
        } catch (err: any) {
          skippedCount++;
          errors.push(`${emp.employeeNumber}: ${err?.message || 'Unknown error'}`);
        }
      }

      if (mailboxCacheDirty) {
        await this.mailboxCacheService.invalidate();
      }

      syncLog.totalCount = departments.length + employees.length;
      syncLog.createdCount = createdCount;
      syncLog.updatedCount = updatedCount;
      syncLog.deactivatedCount = deactivatedCount;
      syncLog.skippedCount = skippedCount;
      syncLog.status = errors.length > 0 ? 'PARTIAL' : 'SUCCESS';
      syncLog.errorSummary = errors.length > 0 ? errors.slice(0, 50).join('\n') : null;
      syncLog.finishedAt = new Date();
      return await this.syncLogRepo.save(syncLog);
    } catch (err: any) {
      this.logger.error(`AMS organization sync failed: ${err?.message}`, err?.stack);
      syncLog.status = 'FAILED';
      syncLog.errorSummary = err?.message || 'Organization sync failed';
      syncLog.finishedAt = new Date();
      return await this.syncLogRepo.save(syncLog);
    }
  }

  private async syncDepartments(
    payloads: AmsDepartmentPayloadDto[],
    now: Date,
    byAmsId: Map<string, Department>,
    byCode: Map<string, Department>,
  ): Promise<void> {
    // 1차: 노드 생성/속성 갱신
    for (const p of payloads) {
      const normalizedCode = p.code?.trim() || null;
      let dept = byAmsId.get(p.amsDeptId) || (normalizedCode ? byCode.get(normalizedCode) : undefined);

      if (!dept) {
        dept = this.departmentRepo.create({
          amsDeptId: p.amsDeptId,
          code: normalizedCode,
          name: p.name.trim(),
          sortOrder: p.sortOrder ?? 0,
          managerEmployeeId: p.managerEmployeeId?.trim() || null,
          source: 'AMS',
          isActive: p.isActive ?? true,
          lastSyncedAt: now,
        });
      } else {
        dept.amsDeptId = p.amsDeptId;
        if (normalizedCode !== null) dept.code = normalizedCode;
        dept.name = p.name.trim();
        if (p.sortOrder !== undefined) dept.sortOrder = p.sortOrder;
        if (p.managerEmployeeId !== undefined) {
          dept.managerEmployeeId = p.managerEmployeeId?.trim() || null;
        }
        if (p.isActive !== undefined) dept.isActive = p.isActive;
        dept.source = 'AMS';
        dept.lastSyncedAt = now;
      }

      const saved = await this.departmentRepo.save(dept);
      byAmsId.set(p.amsDeptId, saved);
      if (saved.code) byCode.set(saved.code, saved);
    }

    // 2차: parentId 연결 및 depth/path 계산
    for (const p of payloads) {
      const dept = byAmsId.get(p.amsDeptId);
      if (!dept) continue;

      const parent = p.parentAmsDeptId ? byAmsId.get(p.parentAmsDeptId) : null;
      dept.parentId = parent ? parent.id : null;
      await this.departmentRepo.save(dept);
    }

    const computeDepthAndPath = (dept: Department, visited = new Set<string>()): { depth: number; path: string } => {
      if (!dept.parentId || visited.has(dept.id)) {
        return { depth: 0, path: `/${dept.id}` };
      }
      visited.add(dept.id);
      const parent = Array.from(byAmsId.values()).find((d) => d.id === dept.parentId);
      if (!parent) {
        return { depth: 0, path: `/${dept.id}` };
      }
      const pInfo = computeDepthAndPath(parent, visited);
      return { depth: pInfo.depth + 1, path: `${pInfo.path}/${dept.id}` };
    };

    for (const p of payloads) {
      const dept = byAmsId.get(p.amsDeptId);
      if (!dept) continue;
      const { depth, path } = computeDepthAndPath(dept);
      if (dept.depth !== depth || dept.path !== path) {
        dept.depth = depth;
        dept.path = path;
        await this.departmentRepo.save(dept);
      }
    }
  }

  private async syncSingleEmployee(
    emp: AmsEmployeePayloadDto,
    now: Date,
    autoProvision: boolean,
    isLicenseValid: boolean,
    remainingSeats: number,
    deptByAmsId: Map<string, Department>,
    deptByCode: Map<string, Department>,
  ): Promise<{ action: 'CREATED' | 'UPDATED' | 'DEACTIVATED' | 'SKIPPED'; mailboxChanged?: boolean; reason?: string }> {
    const empNo = emp.employeeNumber.trim();
    const targetDept =
      (emp.amsDeptId ? deptByAmsId.get(emp.amsDeptId) : undefined) ||
      (emp.departmentCode ? deptByCode.get(emp.departmentCode.trim()) : undefined) ||
      null;

    let user = await this.userRepo.findOne({ where: { employeeId: empNo } });
    if (!user && emp.amsUserId) {
      user = await this.userRepo.findOne({ where: { amsUserId: emp.amsUserId } });
    }

    const nextStatus = emp.employmentStatus || 'ACTIVE';

    // 기존 사용자 업데이트
    if (user) {
      user.employeeId = empNo;
      if (emp.amsUserId) user.amsUserId = emp.amsUserId;
      user.name = emp.name.trim();
      user.departmentId = targetDept ? targetDept.id : user.departmentId;
      if (emp.position !== undefined) user.position = emp.position?.trim() || null;
      if (emp.jobTitle !== undefined) user.jobTitle = emp.jobTitle?.trim() || null;
      if (emp.phone !== undefined) user.phone = emp.phone?.trim() || null;
      if (emp.mobile !== undefined) user.mobile = emp.mobile?.trim() || null;
      user.syncSource = 'AMS';
      user.employmentStatus = nextStatus;
      user.lastSyncedAt = now;

      let mailboxChanged = false;
      if (nextStatus === 'RESIGNED' || nextStatus === 'ON_LEAVE') {
        const wasActive = user.isActive;
        user.isActive = false;
        if (!user.resignedAt) user.resignedAt = now;

        const mailbox = await this.mailboxRepo.findOne({ where: { email: user.email } });
        if (mailbox && mailbox.isActive) {
          mailbox.isActive = false;
          await this.mailboxRepo.save(mailbox);
          mailboxChanged = true;
        }
        await this.userRepo.save(user);
        return {
          action: wasActive ? 'DEACTIVATED' : 'UPDATED',
          mailboxChanged,
        };
      }

      // 복직/재직 상태
      user.resignedAt = null;
      await this.userRepo.save(user);
      return { action: 'UPDATED', mailboxChanged };
    }

    // 신규 사용자 생성 조건 확인
    if (nextStatus !== 'ACTIVE' || emp.mailEnabled === false || !autoProvision) {
      return { action: 'SKIPPED', reason: '신규 계정 자동 생성 대상 아님' };
    }

    const normalizedEmail = emp.email?.toLowerCase().trim();
    if (!normalizedEmail) {
      return { action: 'SKIPPED', reason: '이메일 주소 누락으로 메일 계정 생성 불가' };
    }

    const domainName = normalizedEmail.split('@')[1];
    const domain = domainName
      ? await this.domainRepo.findOne({ where: { name: domainName, isActive: true } })
      : null;
    if (!domain) {
      return { action: 'SKIPPED', reason: `등록되지 않았거나 비활성화된 도메인(@${domainName || ''})` };
    }

    const emailDup = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    if (emailDup) {
      return { action: 'SKIPPED', reason: `동일 이메일(${normalizedEmail})의 기존 계정이 다른 사번으로 존재` };
    }

    if (!isLicenseValid || remainingSeats <= 0) {
      return { action: 'SKIPPED', reason: 'LEMail 라이선스 활성 사용자 정원 초과 또는 라이선스 미등록' };
    }

    const randomPass = crypto.randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(randomPass, 10);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newUser = queryRunner.manager.create(User, {
        email: normalizedEmail,
        name: emp.name.trim(),
        passwordHash,
        role: UserRole.USER,
        isActive: true,
        mailboxQuotaMb: 512,
        preferredLanguage: 'ko',
        timezone: 'Asia/Seoul',
        employeeId: empNo,
        amsUserId: emp.amsUserId || null,
        departmentId: targetDept ? targetDept.id : null,
        position: emp.position?.trim() || null,
        jobTitle: emp.jobTitle?.trim() || null,
        phone: emp.phone?.trim() || null,
        mobile: emp.mobile?.trim() || null,
        syncSource: 'AMS',
        employmentStatus: 'ACTIVE',
        lastSyncedAt: now,
      });
      const savedUser = await queryRunner.manager.save(newUser);

      let mailbox = await queryRunner.manager.findOne(Mailbox, {
        where: { email: normalizedEmail },
      });
      if (!mailbox) {
        mailbox = queryRunner.manager.create(Mailbox, {
          email: normalizedEmail,
          domain: domainName,
          isActive: true,
        });
        await queryRunner.manager.save(mailbox);
      } else if (!mailbox.isActive) {
        mailbox.isActive = true;
        await queryRunner.manager.save(mailbox);
      }

      await this.mailFolderService.initDefaultFolders(savedUser.id, queryRunner.manager);
      await queryRunner.commitTransaction();
      return { action: 'CREATED', mailboxChanged: true };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
