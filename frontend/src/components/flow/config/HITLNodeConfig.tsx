import { TemplateAutocomplete } from '@/components/flow/config/TemplateAutocomplete';

interface HITLNodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
  nodeId: string;
  nodes: any[];
  edges: any[];
}

export function HITLNodeConfig({ config, onChange, nodeId, nodes, edges }: HITLNodeConfigProps) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Prompt for the User</span>
        <TemplateAutocomplete
          value={config.prompt || ''}
          onChange={(v) => onChange({ prompt: v })}
          placeholder="Please review the generated content before proceeding... Type {{ for field suggestions"
          rows={3}
          nodeId={nodeId}
          nodes={nodes}
          edges={edges}
          selectedFields={config?.inputFields}
        />
      </label>
      <div className="space-y-2">
        <span className="text-sm font-medium text-gray-700 block">Buttons</span>
        {(
          config.buttons || [
            { label: 'Approve', value: 'approved' },
            { label: 'Reject', value: 'rejected' },
          ]
        ).map((btn: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="flex-1 rounded border border-gray-300 p-2 text-sm"
              value={btn.label}
              onChange={(e) => {
                const btns = [...(config.buttons || [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }])];
                btns[i] = { ...btns[i], label: e.target.value };
                onChange({ buttons: btns });
              }}
              placeholder="Button label"
            />
            <input
              className="flex-1 rounded border border-gray-300 p-2 text-sm font-mono"
              value={btn.value}
              onChange={(e) => {
                const btns = [...(config.buttons || [{ label: 'Approve', value: 'approved' }, { label: 'Reject', value: 'rejected' }])];
                btns[i] = { ...btns[i], value: e.target.value };
                onChange({ buttons: btns });
              }}
              placeholder="value"
            />
            <button
              onClick={() => {
                const btns = [
                  ...(config.buttons || [
                    { label: 'Approve', value: 'approved' },
                    { label: 'Reject', value: 'rejected' },
                  ]),
                ];
                btns.splice(i, 1);
                onChange({
                  buttons: btns.length > 0 ? btns : [{ label: 'Approve', value: 'approved' }],
                });
              }}
              className="w-6 h-6 flex items-center justify-center text-xs bg-red-200 text-red-800 rounded hover:bg-red-300 shrink-0 font-bold"
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            const btns = [
              ...(config.buttons || [
                { label: 'Approve', value: 'approved' },
                { label: 'Reject', value: 'rejected' },
              ]),
            ];
            onChange({ buttons: [...btns, { label: '', value: '' }] });
          }}
          className="text-sm text-blue-600 hover:underline block"
        >
          + Add Button
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={config?.allowFeedback !== false}
          onChange={(e) => onChange({ allowFeedback: e.target.checked })}
          className="rounded accent-blue-500"
        />
        <span className="text-sm text-gray-700">Allow reviewer feedback</span>
        <span className="text-xs text-gray-400">(text input field)</span>
      </label>
      {/* Assignment picker (populated when auth is available) */}
      <div className="border-t border-gray-100 pt-3 mt-3">
        <span className="text-sm font-medium text-gray-700 block mb-2">Assignment</span>
        <div className="space-y-2">
          <select
            className="block w-full rounded border border-gray-300 p-2 text-sm bg-white"
            value={config.assignedTo?.type || 'anyone'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'anyone') {
                const { assignedTo, ...rest } = config;
                onChange({ ...rest, assignedTo: undefined });
              } else if (val === 'role') {
                onChange({ assignedTo: { type: 'role', roleId: config.assignedTo?.roleId || '' } });
              } else {
                onChange({ assignedTo: { type: 'user', userId: config.assignedTo?.userId || '' } });
              }
            }}
          >
            <option value="anyone">Anyone (no restriction)</option>
            <option value="role">Specific role</option>
            <option value="user">Specific user</option>
          </select>
          {config.assignedTo?.type === 'role' && (
            <input
              className="block w-full rounded border border-gray-300 p-2 text-sm"
              value={config.assignedTo.roleId || ''}
              onChange={(e) => onChange({ assignedTo: { ...config.assignedTo, roleId: e.target.value } })}
              placeholder="Role name (e.g. admin, editor)"
            />
          )}
          {config.assignedTo?.type === 'user' && (
            <input
              className="block w-full rounded border border-gray-300 p-2 text-sm"
              value={config.assignedTo.userId || ''}
              onChange={(e) => onChange({ assignedTo: { ...config.assignedTo, userId: e.target.value } })}
              placeholder="User ID"
            />
          )}
          <p className="text-[10px] text-gray-400">
            Restrict approval visibility to a specific user or role.
          </p>
        </div>
      </div>
    </div>
  );
}
