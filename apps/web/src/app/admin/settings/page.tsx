'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import {
  SettingCategory,
  RestartLevel,
  TargetModule,
  SaveStepSettingsResponseDto,
} from '@lemail/shared-types';
import { PageHeader } from '@/components/common';
import {
  Server,
  Mail,
  Send,
  ShieldCheck,
  Database,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Save,
  HelpCircle,
  Info,
  Layers,
  Cpu,
  Wifi,
  Eye,
  EyeOff,
  Zap,
} from 'lucide-react';

interface SettingMetadata {
  description: string;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  isEncrypted: boolean;
  isSecret: boolean;
  restartRequired: RestartLevel;
  targetModule: TargetModule;
}

interface StepResponse {
  step: number;
  category: SettingCategory;
  categoryLabel: string;
  settings: Record<string, any>;
  metadata: Record<string, SettingMetadata>;
}

interface ModulesStatus {
  smtpIngestion: {
    name: string;
    status: string;
    port: number;
    maxClients: number;
    useProxy: boolean;
  };
  harakaMta: {
    name: string;
    status: string;
    host: string;
    port: number;
  };
  imapService: {
    name: string;
    status: string;
    port: number;
  };
}

const STEPS = [
  {
    step: 1,
    category: SettingCategory.SERVER,
    label: '기본 서버',
    icon: Server,
    summary: 'API 서버 포트, 동시성 스레드 풀, 디스크 스풀 및 메일 아카이브 경로를 설정합니다.',
  },
  {
    step: 2,
    category: SettingCategory.SMTP_INBOUND,
    label: '메일 수신 (SMTP)',
    icon: Mail,
    summary: 'ESMTP 수신 리스닝 포트, 동시 접속 제한, 역방향 프록시 및 사서함 캐시 유효 시간을 제어합니다.',
  },
  {
    step: 3,
    category: SettingCategory.SMTP_OUTBOUND,
    label: '발송 & 릴레이',
    icon: Send,
    summary: '자체 Haraka MTA 발송 및 상위 스마트호스트(Google Workspace, SES, 사내 릴레이)를 설정합니다.',
  },
  {
    step: 4,
    category: SettingCategory.AUTH,
    label: '보안 & JWT 인증',
    icon: ShieldCheck,
    summary: 'JWT 액세스 토큰 서명 키, 토큰 유효 기간 및 기본 시스템 관리자 계정 정보를 관리합니다.',
  },
  {
    step: 5,
    category: SettingCategory.INFRA,
    label: '인프라 (DB & Redis)',
    icon: Database,
    summary: 'MySQL 데이터베이스 및 BullMQ 작업 큐, IMAP 실시간 Push에 사용되는 Redis 연결을 설정합니다.',
  },
];

// 항목별 상세 한글 도움말 사전
const FIELD_HELP: Record<
  string,
  {
    title: string;
    desc: string;
    recommended: string;
    tip?: string;
  }
> = {
  // Step 1
  PORT: {
    title: 'API 서버 HTTP 리스닝 포트',
    desc: 'LEMail 코어 백엔드 REST API 서버가 수신 대기할 HTTP 네트워크 포트입니다. Nginx/ALB 등의 리버스 프록시 뒤에 배치할 경우 해당 프록시가 전달하는 대상 포트와 일치해야 합니다.',
    recommended: '9200 (기본값) 또는 사내 인프라 표준 포트',
    tip: '포트 변경 시 API 서버 전체 재기동이 필요합니다.',
  },
  WORKER_CONCURRENCY: {
    title: 'MIME 파싱 백그라운드 작업자 수',
    desc: '수신된 원시 EML 메일 및 대용량 첨부파일을 병렬 파싱하는 Node.js Worker Thread(Piscina 풀)의 동시 실행 개수입니다.',
    recommended: 'CPU 코어 수와 동일하게 설정 권장 (일반 4~8)',
    tip: '작업자 수가 많을수록 대량 수신 시 처리 속도가 향상되나 메모리 점유율이 높아집니다.',
  },
  MAIL_SPOOL_DIR: {
    title: '수신 원시 EML 임시 스풀 경로',
    desc: '외부에서 인바운드 SMTP로 수신된 메일 스트림이 비차단(Non-blocking) 방식으로 즉시 기록되는 디스크 스풀 경로입니다.',
    recommended: './mail-spool (절대경로 또는 프로젝트 상대경로)',
  },
  MAIL_ARCHIVE_DIR: {
    title: '영구 메일 아카이브 저장 경로',
    desc: 'MIME 파싱 및 사서함 배달 완료 후 원본 메일(.eml)이 날짜별(YYYY-MM)로 영구 보존되는 아카이브 스토리지 경로입니다.',
    recommended: './mail-archive (대용량 디스크 볼륨 권장)',
  },
  MAIL_SPOOL_CLEANUP: {
    title: '스풀 원본 즉시 자동 정리',
    desc: '메일 파싱 및 DB 색인이 완료된 직후 mail-spool 임시 파일을 디스크에서 즉시 삭제할지 여부입니다.',
    recommended: 'false (안전 보관 후 스케줄러로 일괄 정리 권장)',
  },

  // Step 2
  SMTP_PORT: {
    title: 'ESMTP 수신 리스닝 포트',
    desc: '외부 메일 서버 및 내부 클라이언트로부터 메일을 수신하는 고성능 ESMTP 서버의 바인딩 포트입니다.',
    recommended: '2525 (내부/프록시 환경) 또는 25 (인터넷 표준 MX 포트)',
    tip: '포트 변경 시 인바운드 SMTP 엔진 리스너의 재시작이 필요합니다.',
  },
  SMTP_MAX_CLIENTS: {
    title: '최대 동시 접속 SMTP 클라이언트 수',
    desc: '동시에 허용할 SMTP 인바운드 TCP 세션의 최대 연결 수입니다. DoS 공격 방어 및 서버 리소스 보호에 사용됩니다.',
    recommended: '100 ~ 500 (서버 메모리 및 동시 접속 규모에 맞춰 조절)',
  },
  SMTP_USE_PROXY: {
    title: 'HAProxy / PROXY 프로토콜 지원',
    desc: 'HAProxy나 L4 로드밸런서 뒤에서 메일 서버를 운영할 때, 클라이언트의 실제 원본 IP를 확인하기 위해 PROXY 프로토콜 v1/v2를 활성화합니다.',
    recommended: 'false (리버스 프록시 환경에서만 true로 설정)',
    tip: '프록시 없이 직접 접속 시 이 옵션을 활성화하면 연결 핸드셰이크가 실패할 수 있습니다.',
  },
  MAILBOX_CACHE_TTL: {
    title: '사서함 존재 여부 캐시 유효 시간 (초)',
    desc: '수신 메일의 Early Reject(사서함 미존재 시 조기 차단)를 위해 Redis에 캐싱하는 사서함 존재 여부의 유효 기간(초)입니다.',
    recommended: '60초 (기본값) ~ 300초',
  },

  // Step 3
  HARAKA_ENABLED: {
    title: 'Haraka Direct MX 아웃바운드 발송 활성화',
    desc: '외부 릴레이 없이 LEMail 자체 내장 고속 Haraka MTA 엔진을 통해 수신자 도메인의 DNS MX 레코드를 직접 조회하여 발송합니다.',
    recommended: 'true (릴레이를 사용하지 않는 환경에서 필수)',
  },
  HARAKA_HOST: {
    title: 'Haraka MTA 호스트 주소',
    desc: '로컬에서 기동되는 Haraka MTA 서비스의 바인딩 IP 주소입니다.',
    recommended: '127.0.0.1',
  },
  HARAKA_PORT: {
    title: 'Haraka MTA 포트 번호',
    desc: '로컬 Haraka MTA 서비스가 수신 대기하는 포트 번호입니다.',
    recommended: '2526',
  },
  SMTP_RELAY_ENABLED: {
    title: '외부 스마트호스트 SMTP 릴레이 활성화',
    desc: '외부 메일 서비스(AWS SES, Google Workspace, 사내 상위 릴레이 등)를 경유하여 메일을 발송할지 여부입니다. 활성화 시 설정된 릴레이를 우선 사용합니다.',
    recommended: '외부 메일 스팸 차단 회피를 위해 고정 공인 IP가 없는 경우 활성화 권장',
  },
  SMTP_RELAY_HOST: {
    title: 'SMTP 릴레이 호스트',
    desc: '상위 릴레이 메일 서버 주소입니다. (예: mail.aibworks.com, smtp.gmail.com, email-smtp.ap-northeast-2.amazonaws.com)',
    recommended: '정확한 FQDN 도메인 또는 IP',
  },
  SMTP_RELAY_PORT: {
    title: 'SMTP 릴레이 포트',
    desc: '상위 릴레이 서버가 제공하는 포트 번호입니다. (일반 587: STARTTLS, 465: SSL, 25: 표준)',
    recommended: '587 (권장) 또는 465',
  },
  SMTP_RELAY_SECURE: {
    title: 'SSL/TLS 암호화 강제 여부',
    desc: '465 포트를 사용할 경우 true, 587(STARTTLS) 포트를 사용할 경우 false로 설정합니다.',
    recommended: 'false (587 포트 사용 시)',
  },
  SMTP_RELAY_USER: {
    title: '릴레이 인증 계정 (아이디/이메일)',
    desc: '상위 릴레이 메일 서버에 로그인할 인증 계정입니다.',
    recommended: '예: admin@aibworks.com 또는 SES Access Key ID',
  },
  SMTP_RELAY_PASS: {
    title: '릴레이 인증 비밀번호',
    desc: '상위 릴레이 메일 서버 인증 비밀번호입니다. DB에 AES-256-GCM 알고리즘으로 안전하게 암호화되어 보관됩니다.',
    recommended: '기존 비밀번호를 유지하려면 입력창을 비워두거나 마스킹 상태로 두세요.',
    tip: 'AES-256-GCM 양방향 대칭키 암호화로 안전하게 암호화되어 DB에 저장됩니다.',
  },
  SMTP_RELAY_REJECT_UNAUTHORIZED: {
    title: '사설/자체서명 SSL 인증서 엄격 검증',
    desc: '사내 폐쇄망 사설 인증서나 자체 서명된 SSL 인증서를 사용할 경우 false로 설정하여 인증서 신뢰 오류를 방지합니다.',
    recommended: 'false (사내망/테스트 환경) 또는 true (공인 인증서)',
  },

  // Step 4
  DEFAULT_ADMIN_EMAIL: {
    title: '시스템 기본 관리자 이메일',
    desc: 'LEMail 시스템 초기 부트스트랩 시 생성된 시스템 최고 관리자 계정 이메일입니다.',
    recommended: 'admin@lineedge.com',
  },
  DEFAULT_ADMIN_NAME: {
    title: '시스템 기본 관리자 성명',
    desc: '관리자 대시보드 및 시스템 알림에 표시되는 기본 관리자 이름입니다.',
    recommended: '시스템관리자',
  },
  JWT_SECRET: {
    title: 'JWT 토큰 서명 시크릿 키',
    desc: '사용자 로그인 세션 토큰의 전자 서명에 사용되는 암호화 키입니다. DB에 AES-256-GCM으로 안전하게 암호화되어 보관됩니다.',
    recommended: '충분히 길고 안전한 무작위 문자열 (32자 이상)',
    tip: '이 키를 변경하면 현재 접속 중인 모든 사용자의 세션이 만료되어 재로그인이 필요합니다.',
  },
  JWT_EXPIRES_IN: {
    title: 'JWT 액세스 토큰 유효 기간',
    desc: '로그인 후 발급되는 토큰의 유효 기간입니다.',
    recommended: '1d (하루) 또는 사내 보안 정책에 맞는 기간 (예: 12h, 7d)',
  },

  // Step 5
  DB_HOST: {
    title: 'MySQL 데이터베이스 호스트',
    desc: 'LEMail 사서함, 메시지, 도메인 메타데이터가 저장되는 MySQL 데이터베이스 서버의 IP 또는 도메인입니다.',
    recommended: '127.0.0.1 또는 전용 DB 서버 주소',
  },
  DB_PORT: {
    title: 'MySQL 데이터베이스 포트',
    desc: 'MySQL 데이터베이스 포트 번호입니다.',
    recommended: '3306 (표준) 또는 지정 포트 (예: 3300)',
  },
  DB_USERNAME: {
    title: 'MySQL 사용자 이름',
    desc: '데이터베이스 접속 계정명입니다.',
    recommended: 'lemail',
  },
  DB_PASSWORD: {
    title: 'MySQL 비밀번호',
    desc: '데이터베이스 접속 비밀번호입니다. AES-256-GCM으로 암호화 보관되며, 로컬 .env 와도 안전하게 동기화됩니다.',
    recommended: '비밀번호를 변경할 때만 새로 입력하세요.',
  },
  DB_DATABASE: {
    title: 'MySQL 데이터베이스명',
    desc: 'LEMail 테이블들이 위치한 스키마 이름입니다.',
    recommended: 'lemaildb',
  },
  DB_POOL_SIZE: {
    title: 'DB 커넥션 풀 크기 (Pool Size)',
    desc: '동시에 유지할 데이터베이스 연결 풀의 최대 개수입니다.',
    recommended: '20 ~ 50 (동시 접속자 규모에 따라 조절)',
  },
  REDIS_HOST: {
    title: 'Redis 서버 호스트',
    desc: 'BullMQ 메일 큐, 사서함 캐시, IMAP 실시간 Push(IDLE Pub/Sub)에 사용되는 Redis 서버 주소입니다.',
    recommended: '127.0.0.1',
  },
  REDIS_PORT: {
    title: 'Redis 포트 번호',
    desc: 'Redis 인스턴스 포트 번호입니다.',
    recommended: '6379',
  },
  REDIS_PASSWORD: {
    title: 'Redis 접속 비밀번호',
    desc: 'Redis 서버 인증 비밀번호입니다. (없을 경우 비워둘 수 있습니다.)',
    recommended: '비밀번호를 변경할 때만 새로 입력하세요.',
  },
};

export default function SettingsPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [stepData, setStepData] = useState<StepResponse | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [revealingSecret, setRevealingSecret] = useState<Record<string, boolean>>({});

  // 시스템 모듈 상태
  const [modulesStatus, setModulesStatus] = useState<ModulesStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // 연결 테스트 상태
  const [testingRelay, setTestingRelay] = useState(false);
  const [testingRedis, setTestingRedis] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // 피드백 알림 (상단 토스트)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // 재시작 확인 모달 상태
  const [restartModal, setRestartModal] = useState<{
    open: boolean;
    changedKeys: string[];
    restartLevel: RestartLevel;
    targetModules: TargetModule[];
    message: string;
    nextStepAfterRestart?: number;
  }>({
    open: false,
    changedKeys: [],
    restartLevel: RestartLevel.NONE,
    targetModules: [],
    message: '',
  });
  const [restartingModule, setRestartingModule] = useState(false);

  // 모듈 상태 조회
  const loadModulesStatus = async () => {
    try {
      setCheckingStatus(true);
      const res = await fetchApi<ModulesStatus>('/admin/settings/modules-status');
      setModulesStatus(res);
    } catch (e: any) {
      console.warn('Failed to load modules status:', e.message);
    } finally {
      setCheckingStatus(false);
    }
  };

  // 해당 스텝 설정 로드
  const loadStepSettings = async (step: number) => {
    try {
      setLoading(true);
      setTestResult(null);
      setFeedback(null);
      const res = await fetchApi<StepResponse>(`/admin/settings/step/${step}`);
      setStepData(res);
      setFormValues(res.settings || {});
    } catch (e: any) {
      setFeedback({
        type: 'error',
        message: `설정을 불러오는데 실패했습니다: ${e.message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModulesStatus();
  }, []);

  useEffect(() => {
    loadStepSettings(currentStep);
  }, [currentStep]);

  // 입력값 변경 핸들러
  const handleInputChange = (key: string, value: any) => {
    setFormValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // 비밀번호 표시 토글 및 실제 암호 복호화 조회
  const toggleShowPassword = async (key: string) => {
    // 이미 열려 있으면 닫기
    if (showPassword[key]) {
      setShowPassword((prev) => ({
        ...prev,
        [key]: false,
      }));
      return;
    }

    // 마스킹된 상태(••••••••)라면 서버에서 실제 복호화된 원본 암호를 조회하여 반영
    const currentValue = formValues[key];
    if (currentValue === '••••••••') {
      try {
        setRevealingSecret((prev) => ({ ...prev, [key]: true }));
        const res = await fetchApi<{ key: string; value: string }>(
          '/admin/settings/reveal-secret',
          {
            method: 'POST',
            body: JSON.stringify({ key }),
          },
        );

        setFormValues((prev) => ({
          ...prev,
          [key]: res.value || '',
        }));
        setShowPassword((prev) => ({
          ...prev,
          [key]: true,
        }));
      } catch (err: any) {
        setFeedback({
          type: 'error',
          message: `암호 복호화 조회 실패: ${err.message}`,
        });
      } finally {
        setRevealingSecret((prev) => ({ ...prev, [key]: false }));
      }
    } else {
      setShowPassword((prev) => ({
        ...prev,
        [key]: true,
      }));
    }
  };

  // 1. 현재 스텝 저장 및 적용 핸들러
  const handleSaveStep = async () => {
    try {
      setSaving(true);
      setFeedback(null);
      setTestResult(null);

      const res = await fetchApi<SaveStepSettingsResponseDto>(
        `/admin/settings/step/${currentStep}`,
        {
          method: 'PUT',
          body: JSON.stringify({ settings: formValues }),
        },
      );

      // 모듈 재시작이 필요한 경우 팝업 다이얼로그 표시
      if (res.requiresRestart) {
        setRestartModal({
          open: true,
          changedKeys: res.changedKeys,
          restartLevel: res.restartLevel,
          targetModules: res.targetModules,
          message: res.message,
          nextStepAfterRestart: currentStep < 5 ? currentStep + 1 : undefined,
        });
      } else {
        setFeedback({
          type: 'success',
          message: `${res.message} (재시작 불필요: 런타임에 즉시 반영되었습니다)`,
        });
        // 재시작이 필요 없으면 잠시 후 다음 스텝으로 자연스럽게 안내
        if (currentStep < 5) {
          setTimeout(() => {
            setCurrentStep((prev) => prev + 1);
          }, 1000);
        }
      }

      await loadModulesStatus();
    } catch (e: any) {
      setFeedback({
        type: 'error',
        message: `설정 저장 중 오류가 발생했습니다: ${e.message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  // 2. 이전 단계 이동
  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // 4. 모듈 즉시 재시작 실행
  const handleExecuteRestart = async () => {
    try {
      setRestartingModule(true);
      const target = restartModal.targetModules[0] || TargetModule.SMTP_INGESTION;

      const res = await fetchApi<{ success: boolean; message: string }>(
        '/admin/settings/restart-module',
        {
          method: 'POST',
          body: JSON.stringify({ module: target }),
        },
      );

      setFeedback({
        type: 'success',
        message: `[${target}] ${res.message}`,
      });

      setRestartModal((prev) => ({ ...prev, open: false }));
      await loadModulesStatus();

      // 다음 스텝으로 이동
      if (restartModal.nextStepAfterRestart) {
        setCurrentStep(restartModal.nextStepAfterRestart);
      }
    } catch (e: any) {
      setFeedback({
        type: 'error',
        message: `모듈 재시작 실패: ${e.message}`,
      });
    } finally {
      setRestartingModule(false);
    }
  };

  // 5. SMTP 릴레이 연결 테스트
  const handleTestRelay = async () => {
    try {
      setTestingRelay(true);
      setTestResult(null);
      const res = await fetchApi<{ success: boolean; message: string }>(
        '/admin/settings/test-relay',
        {
          method: 'POST',
          body: JSON.stringify({
            host: formValues.SMTP_RELAY_HOST,
            port: Number(formValues.SMTP_RELAY_PORT || 587),
            secure: Boolean(formValues.SMTP_RELAY_SECURE),
            user: formValues.SMTP_RELAY_USER,
            pass: formValues.SMTP_RELAY_PASS,
            rejectUnauthorized: Boolean(formValues.SMTP_RELAY_REJECT_UNAUTHORIZED),
          }),
        },
      );
      setTestResult(res);
    } catch (e: any) {
      setTestResult({
        success: false,
        message: `테스트 실패: ${e.message}`,
      });
    } finally {
      setTestingRelay(false);
    }
  };

  // 6. Redis 연결 테스트
  const handleTestRedis = async () => {
    try {
      setTestingRedis(true);
      setTestResult(null);
      const res = await fetchApi<{ success: boolean; message: string }>(
        '/admin/settings/test-redis',
        {
          method: 'POST',
          body: JSON.stringify({
            host: formValues.REDIS_HOST,
            port: Number(formValues.REDIS_PORT || 6379),
            password: formValues.REDIS_PASSWORD,
          }),
        },
      );
      setTestResult(res);
    } catch (e: any) {
      setTestResult({
        success: false,
        message: `테스트 실패: ${e.message}`,
      });
    } finally {
      setTestingRedis(false);
    }
  };

  const currentStepMeta = STEPS[currentStep - 1];

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <PageHeader
        title="웹 환경설정 (System Configuration)"
        subtitle="서버 포트, ESMTP 인바운드 수신 엔진, 아웃바운드 릴레이, 보안 인증 및 인프라 설정을 웹 콘솔에서 단계별로 안전하게 구성합니다."
      />

      {/* 2. System Live Modules Status Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">시스템 서브모듈 실시간 런타임 상태</h3>
              <p className="text-xs text-slate-400">설정 변경 시 소켓 리스너의 가동 상태를 실시간 점검합니다.</p>
            </div>
          </div>
          <button
            onClick={loadModulesStatus}
            disabled={checkingStatus}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? 'animate-spin text-sky-400' : ''}`} />
            <span>상태 새로고침</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* SMTP Ingestion */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
            <div>
              <div className="text-xs font-medium text-slate-400">SMTP 수신 엔진</div>
              <div className="mt-1 text-sm font-bold text-white">
                포트: {modulesStatus?.smtpIngestion?.port || 2525}
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                modulesStatus?.smtpIngestion?.status === 'RUNNING'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${modulesStatus?.smtpIngestion?.status === 'RUNNING' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              {modulesStatus?.smtpIngestion?.status || 'RUNNING'}
            </span>
          </div>

          {/* Haraka MTA */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
            <div>
              <div className="text-xs font-medium text-slate-400">Haraka Outbound MTA</div>
              <div className="mt-1 text-sm font-bold text-white">
                포트: {modulesStatus?.harakaMta?.port || 2526}
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                modulesStatus?.harakaMta?.status === 'RUNNING'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${modulesStatus?.harakaMta?.status === 'RUNNING' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {modulesStatus?.harakaMta?.status || 'STANDBY'}
            </span>
          </div>

          {/* IMAP Service */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
            <div>
              <div className="text-xs font-medium text-slate-400">IMAP4rev1 서비스</div>
              <div className="mt-1 text-sm font-bold text-white">포트: 1143 / 1993</div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                modulesStatus?.imapService?.status === 'RUNNING'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              정상 대기
            </span>
          </div>
        </div>
      </div>

      {/* 3. Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-4 text-sm transition-all ${
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
              : feedback.type === 'error'
              ? 'border-rose-500/30 bg-rose-950/30 text-rose-300'
              : 'border-sky-500/30 bg-sky-950/30 text-sky-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
          ) : feedback.type === 'error' ? (
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
          ) : (
            <Info className="h-5 w-5 shrink-0 text-sky-400 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{feedback.message}</div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white transition"
          >
            &times;
          </button>
        </div>
      )}

      {/* 4. Step-by-Step Wizard Stepper Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isActive = s.step === currentStep;
            const isPassed = s.step < currentStep;

            return (
              <button
                key={s.step}
                onClick={() => setCurrentStep(s.step)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-600/20 text-white shadow-md shadow-indigo-500/10'
                    : isPassed
                    ? 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                    : 'border-slate-800/60 bg-slate-950/30 text-slate-500 hover:text-slate-400'
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : isPassed
                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {isPassed ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Step {s.step}
                  </div>
                  <div className="truncate text-xs font-bold">{s.label}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Main Form Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
        {/* Step Title Header */}
        <div className="border-b border-slate-800/80 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
                {React.createElement(currentStepMeta?.icon || Server, { className: 'h-5 w-5' })}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-indigo-950 px-2 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-800">
                    STEP {currentStep} / 5
                  </span>
                  <h2 className="text-lg font-bold text-white">
                    {stepData?.categoryLabel || currentStepMeta?.label}
                  </h2>
                </div>
                <p className="mt-1 text-xs text-slate-400">{currentStepMeta?.summary}</p>
              </div>
            </div>

            {/* Test Connection Buttons */}
            {currentStep === 3 && (
              <button
                type="button"
                onClick={handleTestRelay}
                disabled={testingRelay}
                className="flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-400 hover:bg-sky-500/20 transition disabled:opacity-50"
              >
                <Wifi className={`h-3.5 w-3.5 ${testingRelay ? 'animate-spin' : ''}`} />
                <span>{testingRelay ? '릴레이 연결 검증 중...' : 'SMTP 릴레이 연결 테스트'}</span>
              </button>
            )}

            {currentStep === 5 && (
              <button
                type="button"
                onClick={handleTestRedis}
                disabled={testingRedis}
                className="flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-400 hover:bg-sky-500/20 transition disabled:opacity-50"
              >
                <Wifi className={`h-3.5 w-3.5 ${testingRedis ? 'animate-spin' : ''}`} />
                <span>{testingRedis ? 'Redis PING 중...' : 'Redis 연결 테스트'}</span>
              </button>
            )}
          </div>

          {/* Test Result Message Box */}
          {testResult && (
            <div
              className={`mt-4 flex items-center gap-2.5 rounded-xl border p-3.5 text-xs font-medium ${
                testResult.success
                  ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
                  : 'border-rose-500/30 bg-rose-950/20 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Fields List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <RefreshCw className="h-7 w-7 animate-spin text-indigo-500 mb-3" />
            <span className="text-sm">설정 항목을 안전하게 조회하고 있습니다...</span>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {Object.keys(formValues).map((key) => {
              const meta = stepData?.metadata?.[key];
              const help = FIELD_HELP[key];
              const value = formValues[key];
              const isPasswordType = meta?.isSecret;

              return (
                <div
                  key={key}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 transition-all hover:border-slate-700/80"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    {/* Field Description Column */}
                    <div className="lg:w-7/12 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {help?.title || key}
                        </span>
                        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-mono text-sky-300">
                          {key}
                        </code>

                        {/* Badges */}
                        {meta?.isEncrypted && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-950/80 border border-amber-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                            <Lock className="h-2.5 w-2.5" />
                            AES-256-GCM 암호화
                          </span>
                        )}

                        {meta?.restartRequired === RestartLevel.HARD && (
                          <span className="rounded bg-rose-950/80 border border-rose-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400">
                            서버 재시작 필요
                          </span>
                        )}
                        {meta?.restartRequired === RestartLevel.SOFT && (
                          <span className="rounded bg-amber-950/80 border border-amber-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                            모듈 핫리로드 필요
                          </span>
                        )}
                        {meta?.restartRequired === RestartLevel.NONE && (
                          <span className="rounded bg-emerald-950/80 border border-emerald-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                            즉시 반영
                          </span>
                        )}
                      </div>

                      <p className="text-xs leading-relaxed text-slate-300">
                        {help?.desc || meta?.description || '환경변수 설정값입니다.'}
                      </p>

                      {help?.recommended && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-400">권장값:</span>
                          <span className="text-indigo-300">{help.recommended}</span>
                        </div>
                      )}

                      {help?.tip && (
                        <div className="flex items-start gap-1 text-[11px] text-amber-400/90">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                          <span>{help.tip}</span>
                        </div>
                      )}
                    </div>

                    {/* Field Input Control Column */}
                    <div className="lg:w-4/12">
                      {meta?.valueType === 'boolean' ? (
                        <div className="flex items-center gap-3 pt-2">
                          <label className="relative inline-flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={Boolean(value)}
                              onChange={(e) => handleInputChange(key, e.target.checked)}
                              className="peer sr-only"
                            />
                            <div className="peer h-6 w-11 rounded-full bg-slate-800 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-focus:outline-none"></div>
                          </label>
                          <span className="text-xs font-semibold text-slate-300">
                            {value ? '활성화 (Enabled)' : '비활성화 (Disabled)'}
                          </span>
                        </div>
                      ) : isPasswordType ? (
                        <div className="relative">
                          <input
                            type={showPassword[key] ? 'text' : 'password'}
                            value={value || ''}
                            onChange={(e) => handleInputChange(key, e.target.value)}
                            placeholder="변경할 때만 새 비밀번호를 입력하세요"
                            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 pr-10 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => toggleShowPassword(key)}
                            disabled={revealingSecret[key]}
                            title={showPassword[key] ? '암호 숨기기' : '원래 암호 보기'}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-white transition disabled:opacity-50"
                          >
                            {revealingSecret[key] ? (
                              <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
                            ) : showPassword[key] ? (
                              <EyeOff className="h-4 w-4 text-indigo-400" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <input
                          type={meta?.valueType === 'number' ? 'number' : 'text'}
                          value={value !== null && value !== undefined ? value : ''}
                          onChange={(e) =>
                            handleInputChange(
                              key,
                              meta?.valueType === 'number' ? Number(e.target.value) : e.target.value,
                            )
                          }
                          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 6. Bottom Navigation & Action Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-6">
          {/* Previous Button */}
          <div>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>이전 단계 (Step {currentStep - 1})</span>
              </button>
            ) : (
              <div />
            )}
          </div>

          {/* Action Buttons: Save */}
          <div className="flex items-center gap-3">
            {/* 이 단계 저장 및 적용 버튼 */}
            <button
              type="button"
              onClick={handleSaveStep}
              disabled={saving || loading}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition disabled:opacity-50"
            >
              <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
              <span>
                {saving
                  ? '설정 저장 중...'
                  : currentStep === 5
                  ? 'Step 5 저장 및 전체 완료'
                  : `Step ${currentStep} 저장 후 다음으로`}
              </span>
              <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          </div>
        </div>
      </div>

      {/* 7. Modal: Module Restart Confirmation */}
      {restartModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-amber-500/40 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">서브모듈 재시작 필요 안내</h3>
                <p className="text-xs text-amber-300">
                  변경 사항을 적용하기 위해 해당 서비스의 재시작이 필요합니다.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">재시작 대상 모듈:</span>
                <span className="font-bold text-indigo-400">
                  {restartModal.targetModules.join(', ') || 'SMTP_INGESTION'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">재시작 수준:</span>
                <span
                  className={`font-semibold ${
                    restartModal.restartLevel === RestartLevel.HARD
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {restartModal.restartLevel === RestartLevel.HARD
                    ? '하드 재시작 (API 코어 프로세스)'
                    : '소프트 핫 리로드 (SMTP 리스너 재시작)'}
                </span>
              </div>
              <div className="border-t border-slate-800/80 pt-2 text-slate-300">
                <span className="font-semibold text-slate-400">변경된 항목:</span>{' '}
                {restartModal.changedKeys.map((k) => (
                  <code key={k} className="mr-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-sky-300">
                    {k}
                  </code>
                ))}
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              지금 모듈을 재시작하시겠습니까? 소프트 재시작의 경우 메일 수신 소켓만 1~2초간 재바인딩되며, 다른 작업에는 영향을 주지 않습니다.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRestartModal((prev) => ({ ...prev, open: false }));
                  if (restartModal.nextStepAfterRestart) {
                    setCurrentStep(restartModal.nextStepAfterRestart);
                  }
                }}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition"
              >
                나중에 적용 (다음 단계로)
              </button>

              <button
                type="button"
                onClick={handleExecuteRestart}
                disabled={restartingModule}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition disabled:opacity-50"
              >
                <Zap className={`h-3.5 w-3.5 ${restartingModule ? 'animate-spin' : ''}`} />
                <span>{restartingModule ? '모듈 재시작 중...' : '지금 모듈 재시작'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
