'use strict';

/**
 * LEMail Haraka Bounce UTF-8 / RFC 2047 Patch
 * 
 * 발송 실패 시 Haraka가 생성하는 DSN(배달 상태 알림 / 반송 메일)이
 * 아웃룩(Outlook) 등 표준 이메일 클라이언트에서 제목과 본문이 깨지지 않도록 보정합니다.
 * 
 * 1. Subject 헤더: 비-ASCII 문자를 RFC 2047 규격(=?UTF-8?B?...?=)으로 인코딩
 * 2. 최상위 헤더: MIME-Version: 1.0 보장
 * 3. 본문 파트(Part 1): Content-Type을 charset=utf-8로 변경 및 Content-Transfer-Encoding: 8bit 지정
 */

function encodeRfc2047(headerLine) {
  const colonIdx = headerLine.indexOf(':');
  if (colonIdx === -1) return headerLine;
  const name = headerLine.slice(0, colonIdx);
  const value = headerLine.slice(colonIdx + 1).trim();

  // 순수 7-bit ASCII인 경우 인코딩 불필요
  if (/^[\x20-\x7E]*$/.test(value)) {
    return headerLine;
  }

  // RFC 2047 규격: 한 줄 최대 권장 길이 75자를 준수하기 위해 약 15글자(UTF-8 최대 45바이트) 단위로 분할
  const maxChars = 15;
  const parts = [];
  for (let i = 0; i < value.length; i += maxChars) {
    const chunk = value.slice(i, i + maxChars);
    parts.push('=?UTF-8?B?' + Buffer.from(chunk, 'utf8').toString('base64') + '?=');
  }

  return name + ': ' + parts.join(' ');
}

function patchBounceBodyLines(bounce_body) {
  const result = [];
  let inHeaders = true;
  let hasMimeVersion = false;

  for (let i = 0; i < bounce_body.length; i++) {
    let item = bounce_body[i];

    if (inHeaders) {
      if (item === '\r\n' || item === '\n') {
        inHeaders = false;
        if (!hasMimeVersion) {
          result.push('MIME-Version: 1.0\r\n');
        }
      } else {
        if (/^MIME-Version:/i.test(item)) {
          hasMimeVersion = true;
        } else if (/^Subject:/i.test(item)) {
          const raw = item.replace(/\r?\n$/, '');
          item = encodeRfc2047(raw) + '\r\n';
        }
      }
    }

    if (/Content-Type:\s*text\/(?:plain|html);\s*charset=us-ascii/i.test(item)) {
      item = item.replace(/charset=us-ascii/i, 'charset=utf-8');
      result.push(item);
      result.push('Content-Transfer-Encoding: 8bit\r\n');
      continue;
    }

    result.push(item);
  }

  return result;
}

function applyBouncePatch() {
  try {
    const outbound = require('Haraka/outbound');
    const HMailItem = outbound.HMailItem;
    if (!HMailItem || !HMailItem.prototype) {
      return false;
    }

    if (HMailItem.prototype._lemailBouncePatched) {
      return true;
    }

    const originalFn = HMailItem.prototype.populate_bounce_message_with_headers;
    if (typeof originalFn !== 'function') {
      return false;
    }

    HMailItem.prototype.populate_bounce_message_with_headers = function (from, to, reason, header, cb) {
      originalFn.call(this, from, to, reason, header, (err, bounce_body) => {
        if (err || !Array.isArray(bounce_body)) {
          return cb(err, bounce_body);
        }

        try {
          const patchedBody = patchBounceBodyLines(bounce_body);
          return cb(null, patchedBody);
        } catch (patchErr) {
          console.error('[LEMail Bounce Patch] Failed to patch bounce message:', patchErr);
          return cb(null, bounce_body);
        }
      });
    };

    HMailItem.prototype._lemailBouncePatched = true;
    console.log('[LEMail Bounce Patch] Successfully applied UTF-8 and RFC 2047 patch to Haraka HMailItem');
    return true;
  } catch (err) {
    console.error('[LEMail Bounce Patch] Error applying bounce patch:', err.message);
    return false;
  }
}

module.exports = {
  applyBouncePatch,
  patchBounceBodyLines,
  encodeRfc2047,
};

