import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';

export type ConversationDevCommandAction = {
  id: string;
  label: string;
  onSelect: () => void | Promise<void>;
};

export type ConversationDevCommandMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: ConversationDevCommandAction[];
};

export function ConversationDevCommandMenu({
  open,
  onOpenChange,
  actions,
}: ConversationDevCommandMenuProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search commands..." />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>
        <CommandGroup heading="Developer">
          {actions.map((action) => (
            <CommandItem
              key={action.id}
              value={action.label}
              onSelect={() => {
                onOpenChange(false);
                void action.onSelect();
              }}
            >
              {action.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
