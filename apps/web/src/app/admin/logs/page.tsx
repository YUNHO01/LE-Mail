'use client';

import React, { useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';
import { MailMessageDto } from '@lemail/shared-types';
import { Layers, ShieldCheck, Download, Search, RefreshCw, FileText } from 'lucide-react';

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<MailMessageDto[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await fetchApi<{ items: MailMessageDto[]; total: number }>(
        `/mails?search=${encodeURIComponent(search)}&limit=50`,
      );
      setLogs(res.items);
      setTotal(res.total);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Layers className="h-6 w-6 text-sky-600" />
            <span>수신 및 보안 감사 로그</span>
          </h1>
          <p className="text-sm text-slate-500">인바운드 메일의 보안 인증(SPF, DKIM, DMARC) 및 원본 EML 처리 기록을 검사합니다.</p>
        </div>

        <button
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm border border-slate-200 hover:bg-slate-50 transition"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>새로고침</span>
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="발신자 또는 제목 검색..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none transition focus:border-sky-500 focus:bg-white focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-6 py-3">수신 일시</th>
              <th className="px-6 py-3">메시지 ID</th>
              <th className="px-6 py-3">발신자</th>
              <th className="px-6 py-3">제목</th>
              <th className="px-6 py-3">SPF / DKIM / DMARC</th>
              <th className="px-6 py-3">상태</th>
              <th className="px-6 py-3 text-right">EML 파일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 text-sm">
                  {loading ? '로그를 불러오는 중...' : '기록된 메일 로그가 없습니다.'}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-3 text-slate-400 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 font-mono text-slate-600 truncate max-w-[140px]" title={log.id}>
                    {log.id.slice(0, 8)}...
                  </td>
                  <td className="px-6 py-3 font-medium text-slate-800">{log.sender}</td>
                  <td className="px-6 py-3 text-slate-700 truncate max-w-[200px]" title={log.subject || ''}>
                    {log.subject || '(제목 없음)'}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-1 text-[10px]">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                        S:{log.spfResult}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                        D:{log.dkimResult}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                        M:{log.dmarcResult}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`rounded px-2 py-0.5 font-medium ${
                        log.status === 'PROCESSED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <a
                      href={`/api/mails/${log.id}/raw`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-800 font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>다운로드</span>
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
