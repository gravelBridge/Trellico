import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Provider } from "@/types";

interface ProviderSelectorProps {
  value: Provider;
  onChange: (provider: Provider) => void;
  disabled?: boolean;
}

const PROVIDERS: { value: Provider; label: string; icon: string }[] = [
  { value: "claude_code", label: "Claude Code", icon: "/logos/claude-icon.svg" },
  { value: "amp", label: "Amp", icon: "/logos/amp-icon.svg" },
];

export function ProviderSelector({ value, onChange, disabled }: ProviderSelectorProps) {
  const selectedProvider = PROVIDERS.find((p) => p.value === value) || PROVIDERS[0];

  return (
    <Select value={value} onValueChange={(v) => onChange(v as Provider)} disabled={disabled}>
      <SelectTrigger className="h-8 w-full text-xs">
        <SelectValue>
          <div className="flex items-center gap-2">
            <img
              src={selectedProvider.icon}
              alt={selectedProvider.label}
              className="w-4 h-4 rounded shrink-0"
            />
            <span>{selectedProvider.label}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PROVIDERS.map((provider) => (
          <SelectItem key={provider.value} value={provider.value}>
            <div className="flex items-center gap-2">
              <img
                src={provider.icon}
                alt={provider.label}
                className="w-4 h-4 rounded shrink-0"
              />
              <span>{provider.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
