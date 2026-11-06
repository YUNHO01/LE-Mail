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

/**
 * LEMail Outbound Relay Plugin for Haraka
 * 로컬 LEMail 백엔드(127.0.0.1)에서 요청된 메일에 대해 릴레이를 허용하고
 * Haraka 내장 Outbound 엔진으로 전달하여 외부 도메인의 DNS MX로 직접 발송합니다.
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
