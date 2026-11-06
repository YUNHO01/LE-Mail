'use strict';

const dns = require('dns');

// Haraka 워커 프로세스 DNS 서버 강제 지정 (Google / Cloudflare DNS)
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  const dnsConfig = require('haraka-net-utils/lib/dns_config');
  const resolver = dnsConfig.getDnsResolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
  // ignore
}

// 사내 로컬 수신자 도메인 정의
const LOCAL_DOMAINS = new Set([
  'lineedge.com',
  'localhost',
  'lemail-mta'
]);

/**
 * LEMail Outbound Relay Plugin for Haraka
 * 1. 로컬 LEMail 백엔드(127.0.0.1)에서 요청된 메일에 대해 릴레이를 허용하고
 *    Haraka 내장 Outbound 엔진으로 전달하여 외부 도메인의 DNS MX로 직접 발송합니다.
 * 2. 전송 실패로 인한 반송(Bounce / DSN) 메일 생성 시, 수신자(발송자)가 사내 도메인이면
 *    외부 DNS 조회를 건너뛰고 LEMail Inbound SMTP (127.0.0.1:2525)로 내부 라우팅합니다.
 */

exports.hook_connect = function (next, connection) {
  const ip = connection.remote.ip;
  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === 'localhost'
  ) {
    connection.relaying = true;
    this.loginfo(`[LEMail Relay] Relaying granted for local IP: ${ip}`);
  }
  next();
};

exports.hook_rcpt = function (next, connection, params) {
  const rcpt = params[0];
  if (connection.relaying) {
    this.loginfo(`[LEMail Relay] Accepted recipient for relay: ${rcpt.address()}`);
    return next(OK);
  }
  this.logwarn(`[LEMail Relay] Rejected relay attempt from ${connection.remote.ip} to ${rcpt.address()}`);
  return next(DENY, 'Relay access denied');
};

exports.hook_queue = function (next, connection) {
  if (connection.relaying) {
    this.loginfo(`[LEMail Relay] Enqueueing outbound message from ${connection.transaction.mail_from.address()} to Haraka Outbound Spool`);
    const outbound = this.haraka_require('outbound');
    return outbound.send_trans_email(connection.transaction, next);
  }
  return next();
};

/**
 * Outbound MX 조회 훅
 * 메일 목적지 도메인이 사내 로컬 도메인이거나 host_list에 등록된 도메인이면
 * 외부 DNS 조회를 우회하고 LEMail Inbound SMTP 포트(127.0.0.1:2525)로 전달합니다.
 * (특히 3차 실패 시 자동 생성되는 MAILER-DAEMON의 반송 메일이 발송자에게 즉시 배달됩니다.)
 */
exports.hook_get_mx = function (next, hmail, domain) {
  const lowerDomain = (domain || '').toLowerCase();
  const hostList = this.config.get('host_list', 'list') || [];

  const isLocal = LOCAL_DOMAINS.has(lowerDomain) || hostList.includes(lowerDomain);

  if (isLocal) {
    this.loginfo(
      `[LEMail Relay] Intercepted local domain '${lowerDomain}' -> Routing to LEMail Inbound SMTP (127.0.0.1:2525)`
    );
    return next(OK, {
      exchange: '127.0.0.1',
      port: 2525,
      priority: 0,
      bind_helo: 'lemail-mta',
    });
  }

  // 외부 도메인은 Haraka 기본 DNS MX 조회 엔진으로 진행
  return next();
};
