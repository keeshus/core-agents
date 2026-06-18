import Link from 'next/link';
import { Cpu, Server, BookOpen, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function SettingsIndex() {
  const { user } = useAuth();
  const can = (perm: string) => user?.permissions?.includes(perm) ?? false;
  const backHref = user && !can('flow:create') ? '/approvals' : '/';
  const sections = [
    {
      href: '/settings/endpoints',
      icon: Cpu,
      title: 'LLM Endpoints',
      description: 'Manage your LLM provider connections — Anthropic, OpenAI, and LiteLLM',
    },
    {
      href: '/settings/mcp-servers',
      icon: Server,
      title: 'MCP Servers',
      description: 'Configure Model Context Protocol servers and their available tools',
    },
    {
      href: '/settings/knowledge',
      icon: BookOpen,
      title: 'Knowledge Bases',
      description: 'Upload documents, manage collections, and configure RAG retrieval',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href={backHref} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your central resources</p>
          </div>
        </div>
        <div className="space-y-3">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="block bg-white rounded-lg border p-4 hover:shadow-sm hover:border-blue-200 transition-all"
            >
              <div className="flex items-center gap-3">
                <s.icon className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-medium text-gray-900">{s.title}</p>
                  <p className="text-sm text-gray-500">{s.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
