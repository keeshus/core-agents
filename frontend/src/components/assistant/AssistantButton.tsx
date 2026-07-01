import { useAssistant } from './AssistantContext';
import { Icon } from '@/components/ui/Icon';
import { Tooltip } from '@/components/ui/Tooltip';

export function AssistantButton() {
  const { open, toggle } = useAssistant();
  return (
    <Tooltip content={open ? 'Close assistant' : 'Open assistant'}>
      <button
        data-testid="co-pilot-toggle"
        onClick={toggle}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-m3-3 flex items-center justify-center transition-colors bg-primary text-on-primary hover:brightness-90"
      >
        {open ? <Icon name="close" className="text-xl" /> : <Icon name="chat" className="text-xl" />}
      </button>
    </Tooltip>
  );
}
