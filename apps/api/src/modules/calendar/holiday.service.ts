import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import {
  SystemHoliday,
  HolidaySourceEnum,
  SystemSetting,
} from '../database/entities';
import { CalendarIcsService } from './calendar-ics.service';
import { getKoreanHolidaysInRange, KoreanHolidayItem } from './korean-holidays';
import {
  SystemHolidayDto,
  CreateHolidayDto,
  UpdateHolidayDto,
  HolidaySyncSettingsDto,
  HolidaySyncResultDto,
  SettingCategory,
  RestartLevel,
  TargetModule,
} from '@lemail/shared-types';

const DEFAULT_DATA_GO_KR_API_KEY =
  'PfkMXx%2F9mDjCgOdLYEu5R3AdSdVr9RNq%2B2TYTDdvwPFYoiWuqgJakXsAxaSaymaZy5AN6SB3HZGVPsfbAwh6nA%3D%3D';

const SETTING_KEYS = {
  AUTO_SYNC: 'HOLIDAY_AUTO_SYNC',
  KASI_API_KEY: 'HOLIDAY_KASI_API_KEY',
  ICS_FEED_URL: 'HOLIDAY_ICS_FEED_URL',
  LAST_SYNCED_AT: 'HOLIDAY_LAST_SYNCED_AT',
  LAST_SYNC_STATUS: 'HOLIDAY_LAST_SYNC_STATUS',
};

@Injectable()
export class HolidayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HolidayService.name);
  private readonly yearCache = new Map<number, SystemHoliday[]>();
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(SystemHoliday)
    private readonly holidayRepo: Repository<SystemHoliday>,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
    private readonly icsService: CalendarIcsService,
  ) {}

  async onModuleInit() {
    try {
      await this.seedInitialIfEmpty();
    } catch (err: any) {
      this.logger.warn(`Holiday initial seed skipped: ${err?.message}`);
    }

    // 하루 1회 자동 동기화 조건 확인 (마지막 동기화 후 7일 경과 시 실행)
    this.syncTimer = setInterval(() => {
      this.checkAndRunAutoSync().catch((err) => {
        this.logger.warn(`Auto holiday sync check failed: ${err?.message}`);
      });
    }, 24 * 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private toDto(h: SystemHoliday): SystemHolidayDto {
    return {
      id: h.id,
      holidayDate: h.holidayDate,
      year: h.year,
      name: h.name,
      isSubstitute: Boolean(h.isSubstitute),
      source: h.source,
      isActive: Boolean(h.isActive),
      createdAt: h.createdAt.toISOString(),
      updatedAt: h.updatedAt.toISOString(),
    };
  }

  private invalidateCache(year?: number) {
    if (year !== undefined) {
      this.yearCache.delete(year);
    } else {
      this.yearCache.clear();
    }
  }

  private async seedInitialIfEmpty() {
    const count = await this.holidayRepo.count();
    if (count > 0) return;

    const currentYear = new Date().getFullYear();
    const start = new Date(`${currentYear - 1}-01-01T00:00:00`);
    const end = new Date(`${currentYear + 1}-12-31T23:59:59`);
    const items = getKoreanHolidaysInRange(start, end);

    for (const item of items) {
      const year = Number(item.date.slice(0, 4));
      await this.upsertHolidayItem({
        holidayDate: item.date,
        year,
        name: item.name,
        isSubstitute: item.name.includes('대체'),
        source: HolidaySourceEnum.SEED,
      });
    }
    this.invalidateCache();
    this.logger.log(`Seeded ${items.length} initial Korean holidays into system_holiday.`);
  }

  private async upsertHolidayItem(data: {
    holidayDate: string;
    year: number;
    name: string;
    isSubstitute: boolean;
    source: HolidaySourceEnum;
  }): Promise<'upserted' | 'skipped'> {
    const existing = await this.holidayRepo.findOne({
      where: { holidayDate: data.holidayDate, name: data.name },
    });

    if (existing) {
      // 관리자가 수동으로 관리하거나 비활성화한 항목은 덮어쓰지 않음
      if (
        existing.source === HolidaySourceEnum.ADMIN_MANUAL ||
        !existing.isActive
      ) {
        return 'skipped';
      }
      existing.isSubstitute = data.isSubstitute;
      existing.source = data.source;
      await this.holidayRepo.save(existing);
      return 'upserted';
    }

    const created = this.holidayRepo.create({
      holidayDate: data.holidayDate,
      year: data.year,
      name: data.name,
      isSubstitute: data.isSubstitute,
      source: data.source,
      isActive: true,
    });
    await this.holidayRepo.save(created);
    return 'upserted';
  }

  private async getYearHolidays(year: number): Promise<SystemHoliday[]> {
    if (this.yearCache.has(year)) {
      return this.yearCache.get(year)!;
    }
    const rows = await this.holidayRepo.find({
      where: { year, isActive: true },
      order: { holidayDate: 'ASC' },
    });
    this.yearCache.set(year, rows);
    return rows;
  }

  /**
   * 사용자 캘린더 조회용: 기간 [start, end] 내 활성화된 공휴일 목록 반환
   */
  async getHolidaysInRange(
    start: Date,
    end: Date,
  ): Promise<KoreanHolidayItem[]> {
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    const allRows: SystemHoliday[] = [];

    for (let y = startYear; y <= endYear; y++) {
      const rows = await this.getYearHolidays(y);
      allRows.push(...rows);
    }

    const startStr = this.formatDateStr(start);
    const endStr = this.formatDateStr(end);
    const grouped = new Map<string, string[]>();

    for (const row of allRows) {
      if (row.holidayDate >= startStr && row.holidayDate <= endStr) {
        if (!grouped.has(row.holidayDate)) grouped.set(row.holidayDate, []);
        const names = grouped.get(row.holidayDate)!;
        if (!names.includes(row.name)) {
          names.push(row.name);
        }
      }
    }

    return Array.from(grouped.entries())
      .map(([date, names]) => ({ date, name: names.join(' · ') }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private formatDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ==========================================
  // 관리자용 CRUD & 동기화 메서드
  // ==========================================

  async listByYear(year: number): Promise<SystemHolidayDto[]> {
    const rows = await this.holidayRepo.find({
      where: { year },
      order: { holidayDate: 'ASC', name: 'ASC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async createManual(dto: CreateHolidayDto): Promise<SystemHolidayDto> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.holidayDate)) {
      throw new BadRequestException('날짜 형식은 YYYY-MM-DD 이어야 합니다.');
    }
    const year = Number(dto.holidayDate.slice(0, 4));
    const name = dto.name.trim();

    const dup = await this.holidayRepo.findOne({
      where: { holidayDate: dto.holidayDate, name },
    });
    if (dup) {
      throw new BadRequestException('동일한 날짜와 이름의 공휴일이 이미 존재합니다.');
    }

    const entity = this.holidayRepo.create({
      holidayDate: dto.holidayDate,
      year,
      name,
      isSubstitute: dto.isSubstitute ?? name.includes('대체'),
      source: HolidaySourceEnum.ADMIN_MANUAL,
      isActive: dto.isActive ?? true,
    });
    const saved = await this.holidayRepo.save(entity);
    this.invalidateCache(year);
    return this.toDto(saved);
  }

  async updateHoliday(id: string, dto: UpdateHolidayDto): Promise<SystemHolidayDto> {
    const entity = await this.holidayRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('공휴일 항목을 찾을 수 없습니다.');
    }

    const oldYear = entity.year;
    if (dto.holidayDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.holidayDate)) {
        throw new BadRequestException('날짜 형식은 YYYY-MM-DD 이어야 합니다.');
      }
      entity.holidayDate = dto.holidayDate;
      entity.year = Number(dto.holidayDate.slice(0, 4));
    }
    if (dto.name !== undefined) entity.name = dto.name.trim();
    if (dto.isSubstitute !== undefined) entity.isSubstitute = dto.isSubstitute;
    if (dto.isActive !== undefined) entity.isActive = dto.isActive;
    entity.source = HolidaySourceEnum.ADMIN_MANUAL;

    const saved = await this.holidayRepo.save(entity);
    this.invalidateCache(oldYear);
    this.invalidateCache(saved.year);
    return this.toDto(saved);
  }

  async deleteHoliday(id: string): Promise<{ deleted: true }> {
    const entity = await this.holidayRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('공휴일 항목을 찾을 수 없습니다.');
    }
    const year = entity.year;
    await this.holidayRepo.remove(entity);
    this.invalidateCache(year);
    return { deleted: true };
  }

  private async getSettingValue(key: string): Promise<string | null> {
    const row = await this.settingRepo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  private async setSettingValue(
    key: string,
    value: string,
    valueType: 'string' | 'boolean' = 'string',
  ): Promise<void> {
    let row = await this.settingRepo.findOne({ where: { key } });
    if (!row) {
      row = this.settingRepo.create({
        key,
        value,
        valueType,
        category: SettingCategory.SERVER,
        isEncrypted: false,
        restartRequired: RestartLevel.NONE,
        targetModule: TargetModule.API_SERVER,
      });
    } else {
      row.value = value;
    }
    await this.settingRepo.save(row);
  }

  async getSyncSettings(): Promise<HolidaySyncSettingsDto> {
    const [autoSync, apiKey, icsUrl, lastSyncedAt, lastSyncStatus] =
      await Promise.all([
        this.getSettingValue(SETTING_KEYS.AUTO_SYNC),
        this.getSettingValue(SETTING_KEYS.KASI_API_KEY),
        this.getSettingValue(SETTING_KEYS.ICS_FEED_URL),
        this.getSettingValue(SETTING_KEYS.LAST_SYNCED_AT),
        this.getSettingValue(SETTING_KEYS.LAST_SYNC_STATUS),
      ]);

    return {
      autoSyncEnabled: autoSync !== 'false',
      kasiApiKey:
        apiKey || process.env.DATA_GO_KR_API_KEY || DEFAULT_DATA_GO_KR_API_KEY,
      icsFeedUrl: icsUrl || '',
      lastSyncedAt,
      lastSyncStatus,
    };
  }

  async saveSyncSettings(dto: {
    autoSyncEnabled?: boolean;
    kasiApiKey?: string;
    icsFeedUrl?: string;
  }): Promise<HolidaySyncSettingsDto> {
    if (dto.autoSyncEnabled !== undefined) {
      await this.setSettingValue(
        SETTING_KEYS.AUTO_SYNC,
        String(dto.autoSyncEnabled),
        'boolean',
      );
    }
    if (dto.kasiApiKey !== undefined) {
      await this.setSettingValue(SETTING_KEYS.KASI_API_KEY, dto.kasiApiKey.trim());
    }
    if (dto.icsFeedUrl !== undefined) {
      await this.setSettingValue(SETTING_KEYS.ICS_FEED_URL, dto.icsFeedUrl.trim());
    }
    return this.getSyncSettings();
  }

  /**
   * 1순위: 한국천문연구원(KASI) 특일정보 API 호출 (AMS 방식 참조)
   */
  private async fetchFromKasiApi(
    year: number,
    rawApiKey: string,
  ): Promise<Array<{ date: string; name: string; isSubstitute: boolean }>> {
    const cleanKey = rawApiKey.includes('%')
      ? decodeURIComponent(rawApiKey)
      : rawApiKey;
    const url = `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${encodeURIComponent(
      cleanKey,
    )}&solYear=${year}&numOfRows=100&_type=json`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      throw new Error(`KASI API HTTP ${res.status}`);
    }

    const json: any = await res.json();
    const rawItem = json?.response?.body?.items?.item;
    const items = Array.isArray(rawItem) ? rawItem : rawItem ? [rawItem] : [];

    return items
      .filter((it: any) => it.isHoliday === 'Y')
      .map((it: any) => {
        const rawDate = String(it.locdate);
        const dateStr = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
        let name = String(it.dateName || '').trim();
        if (name === '1월1일') name = '신정';
        const isSubstitute = name.includes('대체');
        return { date: dateStr, name, isSubstitute };
      });
  }

  async syncHolidays(years?: number[]): Promise<HolidaySyncResultDto> {
    const currentYear = new Date().getFullYear();
    const targetYears =
      years && years.length > 0
        ? years
        : [currentYear, currentYear + 1, currentYear + 2];

    const settings = await this.getSyncSettings();
    let upserted = 0;
    let skippedManual = 0;
    let usedSource: 'KASI_API' | 'ICS_IMPORT' | 'SEED' = 'KASI_API';

    try {
      for (const y of targetYears) {
        const items = await this.fetchFromKasiApi(y, settings.kasiApiKey);
        for (const item of items) {
          const outcome = await this.upsertHolidayItem({
            holidayDate: item.date,
            year: y,
            name: item.name,
            isSubstitute: item.isSubstitute,
            source: HolidaySourceEnum.KASI_API,
          });
          if (outcome === 'upserted') upserted++;
          else skippedManual++;
        }
      }
    } catch (kasiErr: any) {
      this.logger.warn(`KASI API sync failed: ${kasiErr?.message}`);

      // 2순위: ICS 피드 URL이 설정되어 있으면 ICS 피드 동기화 시도
      if (settings.icsFeedUrl) {
        usedSource = 'ICS_IMPORT';
        const res = await fetch(settings.icsFeedUrl, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          const msg = `KASI API 및 ICS 피드 동기화 모두 실패 (${kasiErr?.message})`;
          await this.setSettingValue(SETTING_KEYS.LAST_SYNC_STATUS, msg);
          throw new BadRequestException(msg);
        }
        const icsText = await res.text();
        const parsed = this.icsService.parseIcsToEvents(icsText);
        for (const ev of parsed) {
          const dateStr = this.formatDateStr(ev.startAt);
          const year = Number(dateStr.slice(0, 4));
          if (!targetYears.includes(year)) continue;
          const outcome = await this.upsertHolidayItem({
            holidayDate: dateStr,
            year,
            name: ev.title,
            isSubstitute: ev.title.includes('대체'),
            source: HolidaySourceEnum.ICS_IMPORT,
          });
          if (outcome === 'upserted') upserted++;
          else skippedManual++;
        }
      } else {
        const msg = `KASI API 동기화 실패: ${kasiErr?.message}`;
        await this.setSettingValue(SETTING_KEYS.LAST_SYNC_STATUS, msg);
        throw new BadRequestException(msg);
      }
    }

    const syncedAt = new Date().toISOString();
    await this.setSettingValue(SETTING_KEYS.LAST_SYNCED_AT, syncedAt);
    await this.setSettingValue(
      SETTING_KEYS.LAST_SYNC_STATUS,
      `성공 (${usedSource}, 반영 ${upserted}건, 보호 ${skippedManual}건)`,
    );
    this.invalidateCache();

    return {
      syncedYears: targetYears,
      upserted,
      skippedManual,
      source: usedSource,
      syncedAt,
    };
  }

  async importHolidaysFromIcs(icsContent: string): Promise<HolidaySyncResultDto> {
    const parsed = this.icsService.parseIcsToEvents(icsContent);
    if (parsed.length === 0) {
      throw new BadRequestException(
        'ICS 파일에서 유효한 공휴일 일정을 찾지 못했습니다.',
      );
    }

    let upserted = 0;
    let skippedManual = 0;
    const yearsSet = new Set<number>();

    for (const ev of parsed) {
      const dateStr = this.formatDateStr(ev.startAt);
      const year = Number(dateStr.slice(0, 4));
      yearsSet.add(year);
      const outcome = await this.upsertHolidayItem({
        holidayDate: dateStr,
        year,
        name: ev.title,
        isSubstitute: ev.title.includes('대체'),
        source: HolidaySourceEnum.ICS_IMPORT,
      });
      if (outcome === 'upserted') upserted++;
      else skippedManual++;
    }

    const syncedAt = new Date().toISOString();
    await this.setSettingValue(SETTING_KEYS.LAST_SYNCED_AT, syncedAt);
    await this.setSettingValue(
      SETTING_KEYS.LAST_SYNC_STATUS,
      `ICS 파일 업로드 성공 (반영 ${upserted}건)`,
    );
    this.invalidateCache();

    return {
      syncedYears: Array.from(yearsSet).sort(),
      upserted,
      skippedManual,
      source: 'ICS_IMPORT',
      syncedAt,
    };
  }

  private async checkAndRunAutoSync() {
    const settings = await this.getSyncSettings();
    if (!settings.autoSyncEnabled) return;

    if (settings.lastSyncedAt) {
      const last = new Date(settings.lastSyncedAt).getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - last < sevenDaysMs) return;
    }

    await this.syncHolidays();
  }
}
