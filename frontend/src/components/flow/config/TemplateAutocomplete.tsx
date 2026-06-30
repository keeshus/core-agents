import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { getUpstreamNodeIds, getNodeFields } from './InputPreview';
import { validateTemplates } from '@/lib/validateTemplates';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';

const slugify = (s: string) => s.toLowerCase().replace(/[\s.]+/g, '_');

// Slugify a selectedField entry, preserving the dot between label and field
function slugifySelectedField(field: string): string {
  const dot = field.indexOf('.');
  if (dot === -1) return slugify(field);
  return slugify(field.slice(0, dot)) + '.' + field.slice(dot + 1);
}

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
  value = '',
  onChange,
  placeholder,
  rows = 3,
  className = '',
  nodeId,
  nodes = [],
  edges = [],
  selectedFields,
}: TemplateAutocompleteProps) {
  const textareaRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
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
    const errors = validateTemplates(value, upstreamLabels, nodes);
    // Also check if template vars reference fields that are filtered out by input selection
    if (selectedFields && selectedFields.length > 0) {
      const slugFields = selectedFields.map(f => slugifySelectedField(f));
      const regex = /\{\{input\.([^}]+)\}\}/g;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(value)) !== null) {
        const path = m[1].trim();
        const label = path.split('.')[0];
        if (!slugFields.some(f => f === label || f.startsWith(label + '.'))) {
          errors.push({ match: m[0], path: `input.${path}`, message: `Field "${path}" is not included in the selected input fields`, suggestions: [] });
        }
      }
    }
    return errors;
  }, [value, upstreamLabels, nodes, selectedFields]);

  const getCursorPos = useCallback((textarea: HTMLTextAreaElement | HTMLInputElement, text: string) => {
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

  const handleInput = useCallback((newValue: string) => {
    onChange(newValue);

    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart || 0;
    const before = newValue.slice(0, pos);
    const lastOpen = before.lastIndexOf('{{');
    const lastClose = before.lastIndexOf('}}');

    if (lastOpen > lastClose) {
      const partial = before.slice(lastOpen + 2).toLowerCase();
      setFilter(partial);
      setSelectedIndex(0);
      setShowDropdown(true);
      setCursorPos(getCursorPos(textareaRef.current, newValue));
    } else {
      setShowDropdown(false);
    }
  }, [onChange, getCursorPos]);

  const insertSuggestion = useCallback((path: string) => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart ?? 0;
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
    const slugFields = selectedFields.map(f => slugifySelectedField(f));
    const label = s.path.split('.')[1];
    const fullPath = s.path.replace('input.', '');
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
      <TextField
        inputRef={textareaRef}
        label=""
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        multiline
        rows={rows}
        className={className}
      />
      {validationErrors.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {validationErrors.map((err, i) => (
            <p key={i} className="text-[10px] text-error flex items-start gap-1">
              <Icon name="warning" className="text-xs shrink-0 mt-0.5" />
              <span>
                <code className="font-mono text-error">{err.match}</code> — {err.message}
                {err.suggestions.length > 0 && (
                  <span className="text-on-surface-variant"> Did you mean <code className="font-mono text-primary">{err.suggestions[0]}</code>?</span>
                )}
              </span>
            </p>
          ))}
        </div>
      )}
      {showDropdown && filtered.length > 0 && (
        <div
          className="absolute z-50 bg-surface border border-outline-variant rounded shadow-m3-4 max-h-48 overflow-y-auto"
          style={{ top: cursorPos.top, left: cursorPos.left, minWidth: 280 }}
        >
          {filtered.map((s, i) => (
            <button
              key={s.path}
              type="button"
              className={`block w-full text-left px-3 py-2 text-xs border-b border-outline-variant last:border-b-0 ${
                i === selectedIndex ? 'bg-primary-container text-primary' : 'hover:bg-primary-container hover:text-primary'
              }`}
              onClick={() => insertSuggestion(s.path)}
            >
              <code className="font-mono">{s.path}</code>
              <span className="text-on-surface-variant ml-2">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
