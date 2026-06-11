import { useState } from 'react';
import { useState, useRef } from 'react';
import { Send, Loader2, Square } from 'lucide-react';

interface ExecutionPanelProps {
  isRunning: boolean;
  onRun: (input: string) => void;
  onStop?: () => void;
  events: Array<{ type: string; data: Record<string, any>; timestamp: string }>;
  output: any;
  error: string | null;
}

export function ExecutionPanel({ isRunning, onRun, onStop, events, output, error }: ExecutionPanelProps) {
  const [input, setInput] = useState('');
  return (
    <div className="w-72 border-l bg-white flex flex-col h-full">
      <div className="p-3 border-b">
        <h3 className="text-sm font-semibold mb-2">Execution</h3>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='{"message": "Hello!"}'
          rows={2}
          className="w-full text-xs border rounded p-1.5 mb-2 resize-none font-mono"
          disabled={isRunning}
        />
        <div className="flex items-center gap-1.5">
          {isRunning && onStop && (
            <button
              onClick={onStop}
              className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors"
            >
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
          <button
            onClick={() => onRun(input || '{"message":"Hello!"}')}
            disabled={isRunning}
            className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            {isRunning ? 'Running' : 'Run'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {events.length === 0 && !isRunning && (
          <p className="text-xs text-gray-400 text-center mt-4">Click Run to execute the flow</p>
        )}
        {events.map((evt, i) => (
          <div key={i} className={`p-2 rounded text-xs ${
            evt.type.includes('failed') ? 'bg-red-50 border border-red-200' :
            evt.type.includes('completed') ? 'bg-green-50 border border-green-200' :
            'bg-blue-50 border border-blue-200'
          }`}>
            <p className="font-medium">{evt.type}</p>
            <pre className="mt-1 text-[10px] overflow-auto max-h-20">{JSON.stringify(evt.data, null, 2)}</pre>
          </div>
        ))}
        {output && (
          <div className="mt-4">
            <h4 className="text-xs font-medium text-gray-500">Output</h4>
            <pre className="text-[10px] bg-gray-50 p-2 rounded mt-1 overflow-auto max-h-40">{JSON.stringify(output, null, 2)}</pre>
          </div>
        )}
        {error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>
        )}
      </div>
    </div>
  );
}
