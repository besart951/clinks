# Select

Picks one value from a short list; NativeSelect for fixed lists with browser semantics.

## Markup

```svelte
import * as Select from '@codelinks/ui/components/select';
import { NativeSelect } from '@codelinks/ui/components/native-select';
```

## Rules

- Long or searchable lists use SearchableCombobox.
- The trigger follows the Input contract; the chevron turns while open.

## Source

`ui/select/*.svelte`, `native-select/`
