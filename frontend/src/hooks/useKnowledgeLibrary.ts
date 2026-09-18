import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export type KnowledgeTab = 'fingerprints' | 'vulnerabilities' | 'evaluations' | 'mcps';

interface ListResponse {
  status: number;
  message?: string;
  data?: { items?: any[]; total?: number };
}

/**
 * 知识库列表数据层 — 从 KnowledgeBaseDialog 抽取。
 * Dialog 与 RuleLibraryPage 各持独立 hook 实例，状态互不干扰；
 * KnowledgeBaseDialog 的 KnowledgeBaseSettingsRef.refresh 语义对应这里的 refresh()。
 */
export function useKnowledgeLibrary(tab: KnowledgeTab, pageSize = 10) {
  const { t, ready } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const endpoint: Record<KnowledgeTab, string> = {
    fingerprints: '/api/v1/knowledge/fingerprints',
    vulnerabilities: '/api/v1/knowledge/vulnerabilities',
    evaluations: '/api/v1/knowledge/evaluations',
    mcps: '/api/v1/knowledge/mcp',
  };

  const errorKeys: Record<KnowledgeTab, string> = {
    fingerprints: 'knowledgeBase.getFingerprintListFailed',
    vulnerabilities: 'knowledgeBase.getVulnerabilityLibraryFailed',
    evaluations: 'knowledgeBase.getEvaluationSetFailed',
    mcps: 'knowledgeBase.getMCPConfigFailed',
  };

  const fetchList = useCallback(async (targetPage = page, q = searchTerm) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: targetPage.toString(),
        size: pageSize.toString(),
        ...(q && { q }),
      });
      const response = await fetch(`${endpoint[tab]}?${params}`);
      const data: ListResponse = await response.json();
      if (data.status === 0) {
        setItems(data.data?.items || []);
        setTotal(data.data?.total || 0);
        setTotalPages(Math.ceil((data.data?.total || 0) / pageSize) || 1);
      } else {
        const fallback = '获取列表失败';
        toast.error(ready ? t(errorKeys[tab], fallback) : fallback, {
          description: data.message || fallback,
        });
      }
    } catch {
      const fallback = '获取列表失败';
      toast.error(ready ? t(errorKeys[tab], fallback) : fallback);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, searchTerm, pageSize, ready, t]);

  useEffect(() => {
    fetchList(page, searchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fetchList]);

  const refresh = useCallback(() => {
    fetchList(page, searchTerm);
  }, [fetchList, page, searchTerm]);

  const gotoPage = useCallback((p: number) => {
    setPage(p);
    fetchList(p, searchTerm);
  }, [fetchList, searchTerm]);

  const search = useCallback((q: string) => {
    setSearchTerm(q);
    setPage(1);
    fetchList(1, q);
  }, [fetchList]);

  return {
    items, total, totalPages, page, searchTerm, loading,
    fetch, refresh, gotoPage, search, setPage, setSearchTerm,
  };
}

/** 规则库统计卡数据：仅拉 total（pageSize=1） */
export function useKnowledgeTotals() {
  const [totals, setTotals] = useState<Record<KnowledgeTab, number>>({
    fingerprints: 0,
    vulnerabilities: 0,
    evaluations: 0,
    mcps: 0,
  });
  const [agentCount, setAgentCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tabs: KnowledgeTab[] = ['fingerprints', 'vulnerabilities', 'evaluations', 'mcps'];
    const endpoints: Record<KnowledgeTab, string> = {
      fingerprints: '/api/v1/knowledge/fingerprints',
      vulnerabilities: '/api/v1/knowledge/vulnerabilities',
      evaluations: '/api/v1/knowledge/evaluations',
      mcps: '/api/v1/knowledge/mcp',
    };
    (async () => {
      await Promise.all(tabs.map(async tab => {
        try {
          const res = await fetch(`${endpoints[tab]}?page=1&size=1`);
          const data: ListResponse = await res.json();
          if (!cancelled && data.status === 0) {
            setTotals(prev => ({ ...prev, [tab]: data.data?.total || 0 }));
          }
        } catch { /* 静默 */ }
      }));
      try {
        const res = await fetch('/api/v1/knowledge/agent/names');
        const data = await res.json();
        if (!cancelled && data.status === 0) {
          const names = data.data?.names ?? data.data ?? [];
          setAgentCount(Array.isArray(names) ? names.length : null);
        }
      } catch { /* 静默 */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return { totals, agentCount };
}
