<script lang="ts">
	import type { LocalizationViewModel, TranslationBundleViewModel } from '@clinks/clinks-runtime';
	import { Badge } from '@clinks/ui-shared/components/ui/badge';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Label } from '@clinks/ui-shared/components/ui/label';
	import * as Select from '@clinks/ui-shared/components/ui/select';
	import * as Table from '@clinks/ui-shared/components/ui/table';

	let { model, translations }: { model: LocalizationViewModel; translations: TranslationBundleViewModel } = $props();
	const t = (key: string) => translations.t(key);
</script>

<Card.Root>
	<Card.Header><Card.Title>{t('ui.languages')}</Card.Title></Card.Header>
	<Card.Content>
		<Table.Root
			><Table.Header
				><Table.Row><Table.Head>{t('ui.languages')}</Table.Head><Table.Head>{t('ui.locale')}</Table.Head></Table.Row
				></Table.Header
			><Table.Body
				>{#each model.managedLanguages as language}<Table.Row
						><Table.Cell>{language.name}</Table.Cell><Table.Cell
							><Badge variant="outline">{language.code}{language.isDefault ? ` · ${t('ui.default')}` : ''}</Badge
							></Table.Cell
						></Table.Row
					>{/each}</Table.Body
			></Table.Root
		>
	</Card.Content>
</Card.Root>

<Card.Root class="lg:col-span-2">
	<Card.Header><Card.Title>{t('ui.translations')}</Card.Title></Card.Header>
	<Card.Content>
		<form
			class="grid gap-3 md:grid-cols-[9rem_1fr_2fr_auto]"
			onsubmit={(event) => {
				event.preventDefault();
				void model.saveTranslationOverride();
			}}
		>
			<div class="grid gap-2">
				<Label class="sr-only" for="translation-scope">{t('ui.translation_scope')}</Label>
				<Select.Root
					value={model.translationScope}
					onValueChange={(scope) => (model.translationScope = scope as typeof model.translationScope)}
				>
					<Select.Trigger id="translation-scope">{t(`ui.scope_${model.translationScope}`)}</Select.Trigger>
					<Select.Content>
						<Select.Item value="shared">{t('ui.scope_shared')}</Select.Item>
						<Select.Item value="admin">{t('ui.scope_admin')}</Select.Item>
						<Select.Item value="planer_link">{t('ui.scope_planer_link')}</Select.Item>
						<Select.Item value="infra_link">{t('ui.scope_infra_link')}</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
			<div class="grid gap-2">
				<Label class="sr-only" for="translation-key">{t('ui.translation_key')}</Label><Input
					id="translation-key"
					bind:value={model.translationKey}
					required
					placeholder={t('ui.translation_key')}
				/>
			</div>
			<div class="grid gap-2">
				<Label class="sr-only" for="translation-value">{t('ui.translation_value')}</Label><Input
					id="translation-value"
					bind:value={model.translationValue}
					required
					placeholder={t('ui.translation_value')}
				/>
			</div>
			<Button type="submit" class="md:self-end">{t('ui.add_translation')}</Button>
		</form>
	</Card.Content>
</Card.Root>
