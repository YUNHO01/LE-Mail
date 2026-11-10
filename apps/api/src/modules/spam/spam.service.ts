import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SpamRule,
  SpamRuleType,
  SpamRuleTargetType,
} from '../database/entities/spam-rule.entity';
import { MailMessage } from '../database/entities/mail-message.entity';
import { MailFolder } from '../database/entities/mail-folder.entity';
import { UserMail } from '../database/entities/user-mail.entity';
import { FolderType } from '@lemail/shared-types';
import { CreateSpamRuleDto } from './dto/create-spam-rule.dto';
import { MailService } from '../mail/mail.service';
import { BayesianSpamService } from './bayesian-spam.service';

@Injectable()
export class SpamService {
  private readonly logger = new Logger(SpamService.name);

  constructor(
    @InjectRepository(SpamRule)
    private readonly spamRuleRepo: Repository<SpamRule>,
    @InjectRepository(MailMessage)
    private readonly messageRepo: Repository<MailMessage>,
    @InjectRepository(MailFolder)
    private readonly folderRepo: Repository<MailFolder>,
    @InjectRepository(UserMail)
    private readonly userMailRepo: Repository<UserMail>,
    @Inject(forwardRef(() => MailService))
    private readonly mailService: MailService,
    private readonly bayesianSpamService: BayesianSpamService,
  ) {}

  async getRules(userId: string) {
    return this.spamRuleRepo
      .createQueryBuilder('rule')
      .where('rule.userId = :userId OR rule.userId IS NULL', { userId })
      .orderBy('rule.createdAt', 'DESC')
      .getMany();
  }

  async createRule(userId: string, dto: CreateSpamRuleDto, isGlobal = false) {
    const pattern = dto.pattern.toLowerCase().trim();
    if (!pattern) {
      throw new BadRequestException('패턴(이메일, 도메인, IP)을 입력해주세요.');
    }

    const targetUserId = isGlobal ? null : userId;

    // 중복 검사
    const qb = this.spamRuleRepo
      .createQueryBuilder('rule')
      .where('rule.type = :type', { type: dto.type })
      .andWhere('rule.pattern = :pattern', { pattern });

    if (targetUserId) {
      qb.andWhere('rule.userId = :userId', { userId: targetUserId });
    } else {
      qb.andWhere('rule.userId IS NULL');
    }

    const existing = await qb.getOne();
    if (existing) {
      return existing;
    }

    const rule = this.spamRuleRepo.create({
      userId: targetUserId,
      type: dto.type as SpamRuleType,
      targetType: dto.targetType as SpamRuleTargetType,
      pattern,
      reason: dto.reason || null,
    });

    return this.spamRuleRepo.save(rule);
  }

  async deleteRule(userId: string, ruleId: string, isAdmin = false) {
    const rule = await this.spamRuleRepo.findOne({ where: { id: ruleId } });
    if (!rule) {
      throw new NotFoundException('스팸 규칙을 찾을 수 없습니다.');
    }

    if (rule.userId && rule.userId !== userId && !isAdmin) {
      throw new BadRequestException('삭제 권한이 없습니다.');
    }

    if (!rule.userId && !isAdmin) {
      throw new BadRequestException('전사 공통 규칙은 관리자만 삭제할 수 있습니다.');
    }

    await this.spamRuleRepo.remove(rule);
    return { success: true, message: '규칙이 삭제되었습니다.' };
  }

  async reportSpam(userId: string, messageId: string) {
    const message = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!message) {
      throw new NotFoundException('메일을 찾을 수 없습니다.');
    }

    // 사용자 스팸 폴더 조회
    const spamFolder = await this.folderRepo.findOne({
      where: { userId, type: FolderType.SPAM },
    });
    if (!spamFolder) {
      throw new NotFoundException('스팸 편지함을 찾을 수 없습니다.');
    }

    // 메일을 스팸 폴더로 이동
    await this.mailService.moveMail(userId, messageId, spamFolder.id);

    // 발신자 이메일 추출 및 사용자 블랙리스트 자동 등록
    const sender = (message.sender || '').toLowerCase().trim();
    if (sender && sender.includes('@')) {
      // 기존 화이트리스트가 있다면 제거
      await this.spamRuleRepo.delete({
        userId,
        type: SpamRuleType.WHITELIST,
        pattern: sender,
      });

      // 블랙리스트에 없으면 추가
      const existingBlacklist = await this.spamRuleRepo.findOne({
        where: {
          userId,
          type: SpamRuleType.BLACKLIST,
          pattern: sender,
        },
      });

      if (!existingBlacklist) {
        const rule = this.spamRuleRepo.create({
          userId,
          type: SpamRuleType.BLACKLIST,
          targetType: SpamRuleTargetType.EMAIL,
          pattern: sender,
          reason: '사용자 스팸 신고로 자동 차단 등록',
        });
        await this.spamRuleRepo.save(rule);
      }
    }

    this.logger.log(
      `User ${userId} reported mail ${messageId} (sender: ${sender}) as SPAM`,
    );

    return {
      success: true,
      message: '스팸 메일함으로 이동 및 발신자가 차단 목록에 등록되었습니다.',
    };
  }

  async unreportSpam(userId: string, messageId: string) {
    const message = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!message) {
      throw new NotFoundException('메일을 찾을 수 없습니다.');
    }

    // 사용자 받은편지함 조회
    const inboxFolder = await this.folderRepo.findOne({
      where: { userId, type: FolderType.INBOX },
    });
    if (!inboxFolder) {
      throw new NotFoundException('받은편지함을 찾을 수 없습니다.');
    }

    // 메일을 받은편지함으로 이동
    await this.mailService.moveMail(userId, messageId, inboxFolder.id);

    // 발신자 이메일 추출 및 블랙리스트에서 제거
    const sender = (message.sender || '').toLowerCase().trim();
    if (sender && sender.includes('@')) {
      await this.spamRuleRepo.delete({
        userId,
        type: SpamRuleType.BLACKLIST,
        pattern: sender,
      });

      // 수신 허용(화이트리스트) 등록
      const existingWhitelist = await this.spamRuleRepo.findOne({
        where: {
          userId,
          type: SpamRuleType.WHITELIST,
          pattern: sender,
        },
      });

      if (!existingWhitelist) {
        const rule = this.spamRuleRepo.create({
          userId,
          type: SpamRuleType.WHITELIST,
          targetType: SpamRuleTargetType.EMAIL,
          pattern: sender,
          reason: '스팸 해제 (정상 메일 복원)',
        });
        await this.spamRuleRepo.save(rule);
      }
    }

    this.logger.log(
      `User ${userId} restored mail ${messageId} (sender: ${sender}) to INBOX`,
    );

    return {
      success: true,
      message: '받은편지함으로 복원 및 발신자가 수신 허용 목록에 등록되었습니다.',
    };
  }
}
