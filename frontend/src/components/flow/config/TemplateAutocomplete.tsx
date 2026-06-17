import { useState, useRef, useEffect, useCallback } from 'react';
import { getUpstreamNodeIds, getNodeFields } from './InputPreview';

interface TemplateAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  nodeId?: string;
  nodes?: any[];
  edges?: any[];
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
      const label = upNode.data?.label || upNode.data?.type || upId;
      const fields = getNodeFields(upNode);
      result.push({ path: `input.${label}`, label: `${label} (all)` });
      for (const f of fields) {
        result.push({ path: `input.${label}.${f.name}`, label: `${label}.${f.name} : ${f.type}` });
      }
    }
    setAllSuggestions(result);
  }, [nodeId, nodes, edges]);

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

  const filtered = filter
    ? allSuggestions.filter(s => s.label.toLowerCase().includes(filter))
    : allSuggestions;

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
