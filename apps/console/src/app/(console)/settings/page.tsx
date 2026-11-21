'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import {
  SettingCategory,
  RestartLevel,
  TargetModule,
  SaveStepSettingsResponseDto,
  AiProvider,
} from '@lemail/shared-types';
import { PageHeader, ToggleSwitch } from '@/components/common';
import {
  Server,
  Mail,
  Send,
  ShieldCheck,
  Database,
  Lock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  Info,
  Cpu,
  Wifi,
  Eye,
  EyeOff,
  Zap,
  Sparkles,
  Settings,
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

type SettingsTabKey = 'server' | 'inbound' | 'outbound' | 'auth' | 'infra' | 'ai';

const TABS: Array<{
  key: SettingsTabKey;
  step: number;
  category: SettingCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
}> = [
  {
    key: 'server',
    step: 1,
    category: SettingCategory.SERVER,
    label: '기본 서버',
    icon: Server,
    summary: 'API 서버 포트, 동시성 스레드 풀, 디스크 스풀 및 메일 아카이브 경로를 설정합니다.',
  },
  {
    key: 'inbound',
    step: 2,
    category: SettingCategory.SMTP_INBOUND,
    label: '메일 수신 (SMTP)',
    icon: Mail,
    summary: 'ESMTP 수신 리스닝 포트, 동시 접속 제한, 역방향 프록시 및 사서함 캐시 유효 시간을 제어합니다.',
  },
  {
    key: 'outbound',
    step: 3,
    category: SettingCategory.SMTP_OUTBOUND,
    label: '발송 & 릴레이',
    icon: Send,
    summary: '자체 Haraka MTA 발송 및 상위 스마트호스트(Google Workspace, SES, 사내 릴레이)를 설정합니다.',
  },
  {
    key: 'auth',
    step: 4,
    category: SettingCategory.AUTH,
    label: '보안 & JWT 인증',
    icon: ShieldCheck,
    summary: 'JWT 액세스 토큰 서명 키, 토큰 유효 기간 및 기본 시스템 관리자 계정 정보를 관리합니다.',
  },
  {
    key: 'infra',
    step: 5,
    category: SettingCategory.INFRA,
    label: '인프라 (DB & Redis)',
    icon: Database,
    summary: 'MySQL 데이터베이스 및 BullMQ 작업 큐, IMAP 실시간 Push에 사용되는 Redis 연결을 설정합니다.',
  },
  {
    key: 'ai',
    step: 6,
    category: SettingCategory.AI,
    label: 'AI 지원',
    icon: Sparkles,
    summary: '사용자가 개인 외부 AI(OpenAI, Gemini, Claude 등)를 메일·주소록·일정에 연동할 수 있는지 정책을 제어합니다.',
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
    desc: '상위 릴레이 메일 서버 주소입니다. (예: mail.yourdomain.com, smtp.gmail.com, email-smtp.ap-northeast-2.amazonaws.com)',
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
    recommended: '예: smtp-user@yourdomain.com 또는 SES Access Key ID',
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
  AI_PERSONAL_EXTERNAL_ENABLED: {
    title: '개인용 외부 AI 사용 허용',
    desc: '사용자가 환경설정에서 본인의 외부 AI API Key(OpenAI, Gemini, Anthropic 등)를 등록해 메일·주소록·일정에서 AI 보조 기능을 사용할 수 있도록 허용합니다.',
    recommended: 'false (사내 보안 정책 검토 후 활성화 권장)',
    tip: '저장 즉시 런타임에 반영되며 비활성화 시 모든 사용자 AI 메뉴와 API가 차단됩니다.',
  },
  AI_IMAGE_ANALYSIS_ENABLED: {
    title: '본문 이미지 외부 AI 해석(Vision) 허용',
    desc: '메일 본문에 포함된 인라인 이미지(cid, Base64)를 외부 AI로 전송해 내용 요약, OCR 텍스트 추출, 명함 인식을 수행하도록 허용합니다.',
    recommended: 'false (이미지 내 민감 문서 유출 우려 시 비활성화 유지)',
  },
  AI_ALLOWED_PROVIDERS: {
    title: '허용할 외부 AI 제공자',
    desc: '사용자가 선택할 수 있는 외부 AI 서비스 제공자 목록입니다. 사내 승인된 제공자만 허용할 수 있습니다.',
    recommended: '["OPENAI","GEMINI","ANTHROPIC","CUSTOM"]',
  },
  AI_MAX_CONTEXT_CHARS: {
    title: '외부 AI 전송 최대 본문 글자 수',
    desc: '메일 본문이나 서명을 외부 AI로 전송할 때 잘라내는 최대 문자 수입니다. 과도한 토큰 소모 및 대용량 데이터 유출을 방지합니다.',
    recommended: '15000 (약 1.5만 자)',
  },
  MCP_SERVER_ENABLED: {
    title: '원격 MCP(Model Context Protocol) 서버 허용',
    desc: '사용자가 개인 API Key를 발급하여 Claude Desktop, Cursor, 사내 AI 에이전트 등과 LEMail을 MCP 표준 프로토콜로 연동할 수 있도록 허용합니다.',
    recommended: 'true',
  },
  MCP_ALLOW_DIRECT_SEND: {
    title: 'MCP 에이전트 메일 직접 발송 허용',
    desc: 'AI 에이전트가 send_mail 도구를 통해 사용자 확인 없이 메일을 즉시 발송할 수 있도록 허용합니다. false로 두면 임시보관함 저장(create_draft)만 허용됩니다.',
    recommended: 'false (보안상 임시저장 후 웹메일에서 직접 발송 권장)',
  },
};

function SystemSettingsContent() {
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get('tab') as SettingsTabKey | null;
  const validTabKeys = TABS.map((t) => t.key);

  const [activeTab, setActiveTab] = useState<SettingsTabKey>(
    initialTabParam && validTabKeys.includes(initialTabParam) ? initialTabParam : 'server',
  );
  const [tabData, setTabData] = useState<StepResponse | null>(null);
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

  // 피드백 알림
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
  }>({
    open: false,
    changedKeys: [],
    restartLevel: RestartLevel.NONE,
    targetModules: [],
    message: '',
  });
  const [restartingModule, setRestartingModule] = useState(false);

  const currentTabMeta = TABS.find((t) => t.key === activeTab) || TABS[0];

  useEffect(() => {
    const tabParam = searchParams.get('tab') as SettingsTabKey | null;
    if (tabParam && validTabKeys.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // 탭 전환 시 Next.js 라우터 대신 브라우저 히스토리를 갱신하여 스크롤 점프 방지
  const handleTabChange = (tab: SettingsTabKey) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState(null, '', url.toString());

      const scrollParents = document.querySelectorAll('.overflow-y-auto');
      scrollParents.forEach((el) => {
        el.scrollTop = 0;
      });
      window.scrollTo(0, 0);
    }
  };

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

  const loadTabSettings = async (step: number) => {
    try {
      setLoading(true);
      setTestResult(null);
      setFeedback(null);
      setShowPassword({});
      const res = await fetchApi<StepResponse>(`/admin/settings/step/${step}`);
      setTabData(res);
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
    loadTabSettings(currentTabMeta.step);
  }, [currentTabMeta.step]);

  const handleInputChange = (key: string, value: any) => {
    setFormValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleShowPassword = async (key: string) => {
    if (showPassword[key]) {
      setShowPassword((prev) => ({
        ...prev,
        [key]: false,
      }));
      return;
    }

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

  // 현재 탭 설정 독립 저장
  const handleSaveTab = async () => {
    try {
      setSaving(true);
      setFeedback(null);
      setTestResult(null);

      const res = await fetchApi<SaveStepSettingsResponseDto>(
        `/admin/settings/step/${currentTabMeta.step}`,
        {
          method: 'PUT',
          body: JSON.stringify({ settings: formValues }),
        },
      );

      if (res.requiresRestart) {
        setRestartModal({
          open: true,
          changedKeys: res.changedKeys,
          restartLevel: res.restartLevel,
          targetModules: res.targetModules,
          message: res.message,
        });
      } else {
        setFeedback({
          type: 'success',
          message: `${res.message} (재시작 불필요: 런타임에 즉시 반영되었습니다)`,
        });
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
    } catch (e: any) {
      setFeedback({
        type: 'error',
        message: `모듈 재시작 실패: ${e.message}`,
      });
    } finally {
      setRestartingModule(false);
    }
  };

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

  const CurrentIcon = currentTabMeta.icon;

  return (
    <div className="space-y-6 w-full">
      {/* 1. 웹메일 환경설정과 동일한 표준 PageHeader */}
      <PageHeader
        title="시스템 환경설정"
        icon={<Settings className="h-6 w-6 text-[#0071e3]" />}
        subtitle="서버 포트, ESMTP 수신 엔진, 아웃바운드 릴레이, 보안 인증, 인프라 및 AI 정책을 카테고리별로 통합 관리합니다."
      />

      {/* 2. 시스템 서브모듈 실시간 런타임 상태 카드 (라이트 톤) */}
      <div className="rounded-xl border border-black/[0.08] bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0071e3]/10 text-[#0071e3]">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#1d1d1f]">시스템 서브모듈 실시간 런타임 상태</h3>
              <p className="text-xs text-[#6e6e73]">설정 변경 시 소켓 리스너의 가동 상태를 실시간 점검합니다.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadModulesStatus}
            disabled={checkingStatus}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? 'animate-spin text-[#0071e3]' : ''}`} />
            <span>상태 새로고침</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {/* SMTP Ingestion */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-[#f5f5f7]/60 p-3.5">
            <div>
              <div className="text-xs font-medium text-[#6e6e73]">SMTP 수신 엔진</div>
              <div className="mt-1 text-sm font-bold text-[#1d1d1f]">
                포트: {modulesStatus?.smtpIngestion?.port || 2525}
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                modulesStatus?.smtpIngestion?.status === 'RUNNING'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  modulesStatus?.smtpIngestion?.status === 'RUNNING'
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              {modulesStatus?.smtpIngestion?.status || 'RUNNING'}
            </span>
          </div>

          {/* Haraka MTA */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-[#f5f5f7]/60 p-3.5">
            <div>
              <div className="text-xs font-medium text-[#6e6e73]">Haraka Outbound MTA</div>
              <div className="mt-1 text-sm font-bold text-[#1d1d1f]">
                포트: {modulesStatus?.harakaMta?.port || 2526}
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                modulesStatus?.harakaMta?.status === 'RUNNING'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  modulesStatus?.harakaMta?.status === 'RUNNING' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              {modulesStatus?.harakaMta?.status || 'STANDBY'}
            </span>
          </div>

          {/* IMAP Service */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-[#f5f5f7]/60 p-3.5">
            <div>
              <div className="text-xs font-medium text-[#6e6e73]">IMAP4rev1 서비스</div>
              <div className="mt-1 text-sm font-bold text-[#1d1d1f]">포트: 1143 / 1993</div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                modulesStatus?.imapService?.status === 'RUNNING'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  modulesStatus?.imapService?.status === 'RUNNING'
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              {modulesStatus?.imapService?.status || 'RUNNING'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. 웹메일 환경설정과 동일한 수평 탭 네비게이션 */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 pb-3.5 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition ${
                isActive
                  ? 'border-[#0071e3] text-[#0071e3]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4. 피드백 배너 */}
      {feedback && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-4 text-sm transition-all ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : feedback.type === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-sky-200 bg-sky-50 text-sky-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
          ) : feedback.type === 'error' ? (
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
          ) : (
            <Info className="h-5 w-5 shrink-0 text-sky-600 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{feedback.message}</div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-700 transition"
          >
            &times;
          </button>
        </div>
      )}

      {/* 5. 선택된 탭 본문 카드 (라이트 톤 + 독립 저장) */}
      <div className="rounded-xl border border-black/[0.08] bg-white p-6 shadow-xs">
        {/* 탭 섹션 헤더 */}
        <div className="border-b border-slate-100 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]">
                <CurrentIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#1d1d1f]">
                  {tabData?.categoryLabel || currentTabMeta.label}
                </h2>
                <p className="mt-0.5 text-xs text-[#6e6e73]">{currentTabMeta.summary}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeTab === 'outbound' && (
                <button
                  type="button"
                  onClick={handleTestRelay}
                  disabled={testingRelay}
                  className="flex items-center gap-1.5 rounded-lg border border-[#0071e3]/30 bg-[#0071e3]/5 px-3.5 py-2 text-xs font-semibold text-[#0071e3] hover:bg-[#0071e3]/10 transition disabled:opacity-50"
                >
                  <Wifi className={`h-3.5 w-3.5 ${testingRelay ? 'animate-spin' : ''}`} />
                  <span>{testingRelay ? '릴레이 연결 검증 중...' : 'SMTP 릴레이 연결 테스트'}</span>
                </button>
              )}

              {activeTab === 'infra' && (
                <button
                  type="button"
                  onClick={handleTestRedis}
                  disabled={testingRedis}
                  className="flex items-center gap-1.5 rounded-lg border border-[#0071e3]/30 bg-[#0071e3]/5 px-3.5 py-2 text-xs font-semibold text-[#0071e3] hover:bg-[#0071e3]/10 transition disabled:opacity-50"
                >
                  <Wifi className={`h-3.5 w-3.5 ${testingRedis ? 'animate-spin' : ''}`} />
                  <span>{testingRedis ? 'Redis PING 중...' : 'Redis 연결 테스트'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSaveTab}
                disabled={saving || loading}
                className="flex items-center gap-1.5 rounded-lg bg-[#0071e3] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#0077ed] transition disabled:opacity-50"
              >
                <Save className={`h-3.5 w-3.5 ${saving ? 'animate-spin' : ''}`} />
                <span>{saving ? '저장 중...' : '설정 저장'}</span>
              </button>
            </div>
          </div>

          {/* 연결 테스트 결과 배너 */}
          {testResult && (
            <div
              className={`mt-4 flex items-center gap-2.5 rounded-xl border p-3.5 text-xs font-medium ${
                testResult.success
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* 설정 필드 목록 */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#6e6e73]">
            <RefreshCw className="h-7 w-7 animate-spin text-[#0071e3] mb-3" />
            <span className="text-sm">설정 항목을 안전하게 조회하고 있습니다...</span>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {Object.keys(formValues).map((key) => {
              const meta = tabData?.metadata?.[key];
              const help = FIELD_HELP[key];
              const value = formValues[key];
              const isPasswordType = meta?.isSecret;

              return (
                <div
                  key={key}
                  className="rounded-xl border border-slate-200/80 bg-[#f5f5f7]/40 p-4 transition-all hover:border-slate-300"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    {/* 항목 설명 컬럼 */}
                    <div className="lg:w-7/12 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[#1d1d1f]">
                          {help?.title || key}
                        </span>
                        <code className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[11px] font-mono text-[#0071e3]">
                          {key}
                        </code>

                        {meta?.isEncrypted && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            <Lock className="h-2.5 w-2.5" />
                            AES-256-GCM 암호화
                          </span>
                        )}

                        {meta?.restartRequired === RestartLevel.HARD && (
                          <span className="rounded bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                            서버 재시작 필요
                          </span>
                        )}
                        {meta?.restartRequired === RestartLevel.SOFT && (
                          <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            모듈 핫리로드 필요
                          </span>
                        )}
                        {meta?.restartRequired === RestartLevel.NONE && (
                          <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            즉시 반영
                          </span>
                        )}
                      </div>

                      <p className="text-xs leading-relaxed text-[#6e6e73]">
                        {help?.desc || meta?.description || '환경변수 설정값입니다.'}
                      </p>

                      {help?.recommended && (
                        <div className="flex items-center gap-1 text-[11px] text-[#86868b]">
                          <span className="font-semibold text-[#6e6e73]">권장값:</span>
                          <span className="text-[#0071e3] font-medium">{help.recommended}</span>
                        </div>
                      )}

                      {help?.tip && (
                        <div className="flex items-start gap-1 text-[11px] text-amber-700">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-600" />
                          <span>{help.tip}</span>
                        </div>
                      )}
                    </div>

                    {/* 입력 컨트롤 컬럼 */}
                    <div className="lg:w-4/12">
                      {meta?.valueType === 'boolean' ? (
                        <div className="flex items-center gap-3 pt-1">
                          <ToggleSwitch
                            checked={Boolean(value)}
                            onChange={(checked) => handleInputChange(key, checked)}
                            color="sky"
                            showStatusText={false}
                            label={value ? '활성화 (Enabled)' : '비활성화 (Disabled)'}
                          />
                        </div>
                      ) : isPasswordType ? (
                        <div className="relative">
                          <input
                            type={showPassword[key] ? 'text' : 'password'}
                            value={value || ''}
                            onChange={(e) => handleInputChange(key, e.target.value)}
                            placeholder="변경할 때만 새 비밀번호를 입력하세요"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 pr-10 text-xs text-[#1d1d1f] placeholder-slate-400 focus:border-[#0071e3] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/15"
                          />
                          <button
                            type="button"
                            onClick={() => toggleShowPassword(key)}
                            disabled={revealingSecret[key]}
                            title={showPassword[key] ? '암호 숨기기' : '원래 암호 보기'}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-[#1d1d1f] transition disabled:opacity-50"
                          >
                            {revealingSecret[key] ? (
                              <RefreshCw className="h-4 w-4 animate-spin text-[#0071e3]" />
                            ) : showPassword[key] ? (
                              <EyeOff className="h-4 w-4 text-[#0071e3]" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      ) : key === 'AI_ALLOWED_PROVIDERS' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {(Object.values(AiProvider) as AiProvider[]).map((prov) => {
                            const selectedList: string[] = Array.isArray(value)
                              ? value
                              : typeof value === 'string'
                              ? (() => {
                                  try {
                                    const parsed = JSON.parse(value);
                                    return Array.isArray(parsed) ? parsed : [];
                                  } catch {
                                    return value
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                                  }
                                })()
                              : [];
                            const checked = selectedList.includes(prov);
                            return (
                              <label
                                key={prov}
                                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-medium cursor-pointer transition ${
                                  checked
                                    ? 'border-[#0071e3]/40 bg-[#0071e3]/5 text-[#0071e3]'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                <span className="font-semibold">{prov}</span>
                                <span className="relative inline-flex shrink-0 items-center">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? Array.from(new Set([...selectedList, prov]))
                                        : selectedList.filter((p) => p !== prov);
                                      handleInputChange(key, next);
                                    }}
                                    className="peer sr-only"
                                  />
                                  <span className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#0071e3] peer-checked:after:translate-x-4 peer-focus:outline-none"></span>
                                </span>
                              </label>
                            );
                          })}
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
                          className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-[#1d1d1f] placeholder-slate-400 focus:border-[#0071e3] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/15"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 하단 독립 저장 버튼 */}
        <div className="mt-6 flex items-center justify-end border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={handleSaveTab}
            disabled={saving || loading}
            className="flex items-center gap-2 rounded-lg bg-[#0071e3] px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#0077ed] transition disabled:opacity-50"
          >
            <Save className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? '설정 저장 중...' : `${currentTabMeta.label} 설정 저장`}</span>
          </button>
        </div>
      </div>

      {/* 6. 모듈 재시작 확인 모달 (라이트 톤) */}
      {restartModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-black/[0.08] bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 border border-amber-200 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1d1d1f]">서브모듈 재시작 필요 안내</h3>
                <p className="text-xs text-amber-700">
                  변경 사항을 적용하기 위해 해당 서비스의 재시작이 필요합니다.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-[#f5f5f7] p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#6e6e73]">재시작 대상 모듈:</span>
                <span className="font-bold text-[#0071e3]">
                  {restartModal.targetModules.join(', ') || 'SMTP_INGESTION'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#6e6e73]">재시작 수준:</span>
                <span
                  className={`font-semibold ${
                    restartModal.restartLevel === RestartLevel.HARD
                      ? 'text-rose-600'
                      : 'text-amber-700'
                  }`}
                >
                  {restartModal.restartLevel === RestartLevel.HARD
                    ? '하드 재시작 (API 코어 프로세스)'
                    : '소프트 핫 리로드 (SMTP 리스너 재시작)'}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2 text-[#1d1d1f]">
                <span className="font-semibold text-[#6e6e73]">변경된 항목:</span>{' '}
                {restartModal.changedKeys.map((k) => (
                  <code
                    key={k}
                    className="mr-1.5 rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[#0071e3]"
                  >
                    {k}
                  </code>
                ))}
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-[#6e6e73]">
              지금 모듈을 재시작하시겠습니까? 소프트 재시작의 경우 메일 수신 소켓만 1~2초간 재바인딩되며, 다른 작업에는 영향을 주지 않습니다.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRestartModal((prev) => ({ ...prev, open: false }))}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                나중에 적용
              </button>

              <button
                type="button"
                onClick={handleExecuteRestart}
                disabled={restartingModule}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition disabled:opacity-50"
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

export default function SystemSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-xs text-[#86868b]">
          시스템 환경설정을 불러오는 중입니다...
        </div>
      }
    >
      <SystemSettingsContent />
    </Suspense>
  );
}
