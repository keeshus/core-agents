import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { getUpstreamNodeIds, getNodeFields } from './InputPreview';
import { validateTemplates } from '@/lib/validateTemplates';

const slugify = (s: string) => s.toLowerCase().replace(/[\s.]+/g, '_');

interface TemplateAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  nodeId?: string;
  nodes?: any[];
  edges?: any[];
  /** Currently selected input fields for this node. Empty = all fields pass through. */
  selectedFields?: string[];
}

interface Suggestion {
  path: string;
  label: string;
}

export function TemplateAutocomplete({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = '',
  nodeId,
  nodes = [],
  edges = [],
  selectedFields,
}: TemplateAutocompleteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0 });
  const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>([]);

  // Build suggestion list from upstream nodes
  useEffect(() => {
    if (!nodeId || nodes.length === 0) return;
    const upstreamIds = getUpstreamNodeIds(nodeId, edges);
    const result: Suggestion[] = [];
    for (const upId of upstreamIds) {
      const upNode = nodes.find((n: any) => n.id === upId);
      if (!upNode) continue;
      const rawLabel = upNode.data?.label || upNode.data?.type || upId;
      const label = slugify(rawLabel);
      const fields = getNodeFields(upNode);
      result.push({ path: `input.${label}`, label: `${rawLabel} (all)` });
      for (const f of fields) {
        result.push({ path: `input.${label}.${f.name}`, label: `${rawLabel}.${f.name} : ${f.type}` });
      }
    }
    setAllSuggestions(result);
  }, [nodeId, nodes, edges]);

  // Compute upstream labels for validation
  const upstreamLabels = useMemo(() => {
    if (!nodeId || nodes.length === 0) return [];
    const upstreamIds = getUpstreamNodeIds(nodeId, edges);
    const names = new Set<string>();
    for (const upId of upstreamIds) {
      const upNode = nodes.find((n: any) => n.id === upId);
      if (!upNode) continue;
      names.add(slugify(upNode.data?.label || upNode.data?.type || upId));
    }
    return Array.from(names);
  }, [nodeId, nodes, edges]);

  // Validate templates in the current value
  const validationErrors = useMemo(() => {
    if (!value.includes('{{')) return [];
    return validateTemplates(value, upstreamLabels, nodes);
  }, [value, upstreamLabels, nodes]);

  const getCursorPos = useCallback((textarea: HTMLTextAreaElement, text: string) => {
    const pos = textarea.selectionStart || 0;
    const before = text.slice(0, pos);
    const lines = before.split('\n');
    const lineNum = lines.length;
    const colNum = lines[lines.length - 1].length;
    const lineHeight = 20;
    return {
      top: (lineNum * lineHeight) + 24,
      left: Math.min(colNum * 8, 300),
    };
  }, []);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);

    const pos = e.target.selectionStart || 0;
    const before = val.slice(0, pos);
    const lastOpen = before.lastIndexOf('{{');
    const lastClose = before.lastIndexOf('}}');

    if (lastOpen > lastClose) {
      const partial = before.slice(lastOpen + 2).toLowerCase();
      setFilter(partial);
      setSelectedIndex(0);
      setShowDropdown(true);
      setCursorPos(getCursorPos(e.target, val));
    } else {
      setShowDropdown(false);
    }
  }, [onChange, getCursorPos]);

  const insertSuggestion = useCallback((path: string) => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const lastOpen = before.lastIndexOf('{{');
    if (lastOpen === -1) return;
    const newValue = before.slice(0, lastOpen) + `{{${path}}}` + after;
    onChange(newValue);
    setShowDropdown(false);
    setTimeout(() => {
      if (textareaRef.current) {
        const insertPos = lastOpen + path.length + 4;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(insertPos, insertPos);
      }
    }, 0);
  }, [value, onChange]);

  // Filter by search text and by selectedFields
  const filtered = (filter
    ? allSuggestions.filter(s => s.label.toLowerCase().includes(filter))
    : allSuggestions
  ).filter(s => {
    if (!selectedFields || selectedFields.length === 0) return true; // all pass through
    // Slugify both sides so raw labels ("Router") match slugified paths ("router")
    const slugFields = selectedFields.map(f => slugify(f));
    const label = s.path.split('.')[1];
    const fullPath = slugify(s.path.replace('input.', ''));
    return slugFields.includes(label) || slugFields.includes(fullPath);
  });

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === 'Escape') {
      setShowDropdown(false);
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setSelectedIndex(i => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        insertSuggestion(filtered[selectedIndex].path);
      }
    }
  }, [showDropdown, filtered, selectedIndex, insertSuggestion]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={`mt-1 block w-full rounded border border-gray-300 p-2 text-sm resize-y font-mono ${className}`}
      />
      {validationErrors.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {validationErrors.map((err, i) => (
            <p key={i} className="text-[10px] text-red-600 flex items-start gap-1">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>
                <code className="font-mono text-red-700">{err.match}</code> — {err.message}
                {err.suggestions.length > 0 && (
                  <span className="text-gray-500"> Did you mean <code className="font-mono text-blue-600">{err.suggestions[0]}</code>?</span>
                )}
              </span>
            </p>
          ))}
        </div>
      )}
      {showDropdown && filtered.length > 0 && (
        <div
          className="absolute z-50 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto"
          style={{ top: cursorPos.top, left: cursorPos.left, minWidth: 280 }}
        >
          {filtered.map((s, i) => (
            <button
              key={s.path}
              type="button"
              className={`block w-full text-left px-3 py-2 text-xs border-b border-gray-50 last:border-b-0 ${
                i === selectedIndex ? 'bg-blue-100 text-blue-800' : 'hover:bg-blue-50 hover:text-blue-700'
              }`}
              onClick={() => insertSuggestion(s.path)}
            >
              <code className="font-mono">{s.path}</code>
              <span className="text-gray-400 ml-2">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
