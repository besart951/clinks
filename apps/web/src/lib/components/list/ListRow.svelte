<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import * as ContextMenu from '@clinks/ui/components/ui/context-menu';
	import { Checkbox } from '@clinks/ui/components/ui/checkbox';
	import type { ListModel } from '#lib/features/list/list-model.svelte';
	import { RowGesture } from '#lib/features/list/row-gesture.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';
	import ListMenuItems from './ListMenuItems.svelte';

	/**
	 * One entry of a selectable list: a click per `ListModel.press`, a checkbox, the inline actions on hover, a
	 * right-click menu and, on a touch screen, swiping and a long press. The caller gives only the content.
	 */
	let { list, item, children }: { list: ListModel<T, string>; item: T; children: Snippet } = $props();
	const workspace = useWorkspace();
	const selected = $derived(list.has(item));
	const label = $derived(list.label(item));
	const inline = $derived(list.inline(item));
	const start = $derived(list.swipe('start', item));
	const end = $derived(list.swipe('end', item));
	const gesture = new RowGesture({
		canSwipe: (side) => (side === 'start' ? start : end) !== null,
		swiped: (side) => {
			const action = side === 'start' ? start : end;
			if (action) void list.run(action, [item]);
		},
		longPressed: () => {
			list.pick(item);
			navigator.vibrate?.(10);
		},
	});
	/** The action a swipe would run now, shown behind the row. */
	const revealed = $derived(gesture.dx > 0 ? start : gesture.dx < 0 ? end : null);
	let lastPointer = 'mouse';

	function click(event: MouseEvent) {
		if (gesture.swallowClick()) return;
		list.press(event, item);
	}

	/**
	 * The menu trigger's props without its own long press on touch screens: there a long press picks entries,
	 * as on phones; the right-click menu is for mouse and keyboard.
	 */
	function menuTrigger(props: Record<string, unknown>) {
		const {
			onpointerdown: _down,
			onpointermove: _move,
			onpointerup: _up,
			onpointercancel: _cancel,
			oncontextmenu,
			...rest
		} = props;
		return {
			...rest,
			oncontextmenu: (event: MouseEvent) => {
				if (lastPointer === 'touch') {
					event.preventDefault();
					return;
				}
				list.focusMenu(item);
				(oncontextmenu as (event: MouseEvent) => void)(event);
			},
		};
	}
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger>
		{#snippet child({ props })}
			<li
				{...menuTrigger(props)}
				class="group/row relative overflow-hidden touch-pan-y {selected ? 'bg-muted' : ''}"
				data-selected={selected || undefined}
				draggable={list.drag ? true : undefined}
				ondragstart={(event) => list.drag?.(event, item)}
				onpointerdown={(event) => {
					lastPointer = event.pointerType;
					gesture.down(event);
				}}
				onpointermove={(event) => gesture.move(event)}
				onpointerup={(event) => gesture.up(event)}
				onpointercancel={() => gesture.cancel()}
			>
				{#if revealed}
					{@const Icon = revealed.icon([item])}
					<div
						class="absolute inset-0 flex items-center px-5 text-sm font-medium text-white {revealed.destructive
							? 'bg-destructive'
							: 'bg-primary'} {gesture.dx > 0 ? 'justify-start' : 'justify-end'}"
						aria-hidden="true"
					>
						<Icon class="size-5" />
					</div>
				{/if}
				<div
					class="bg-background relative flex items-stretch {gesture.swiping ? '' : 'transition-transform'} {selected
						? 'bg-muted'
						: 'hover:bg-muted/60'}"
					style:translate="{gesture.dx}px 0"
				>
					<span class="flex items-center ps-3">
						<Checkbox
							checked={selected}
							onCheckedChange={() => list.toggle(item)}
							aria-label={workspace.t('ui.ws.select', { name: label })}
							class="transition-opacity {selected || list.many
								? ''
								: 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden'}"
						/>
					</span>
					<button
						type="button"
						class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset"
						aria-current={selected && !list.many ? true : undefined}
						onclick={click}
					>
						{@render children()}
					</button>
					{#if inline.length > 0}
						<!-- Shown on hover and while a part of the row has focus; touch screens swipe instead. -->
						<div
							class="bg-muted absolute inset-y-0 end-0 hidden items-center gap-0.5 ps-2 pe-2 group-focus-within/row:flex group-hover/row:flex [@media(hover:none)]:!hidden"
						>
							{#each inline as action (action.id)}
								{@const Icon = action.icon([item])}
								{@const pressed = action.pressed?.([item])}
								<button
									type="button"
									class="hover:bg-background text-muted-foreground hover:text-foreground grid size-7 place-items-center rounded-md {action.destructive
										? 'hover:text-destructive'
										: ''}"
									aria-label={action.label([item])}
									title={action.label([item])}
									aria-pressed={pressed}
									onclick={() => list.run(action, [item])}
								>
									<Icon class="size-4 {pressed ? (action.pressedClass ?? 'text-foreground') : ''}" />
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</li>
		{/snippet}
	</ContextMenu.Trigger>
	<ContextMenu.Content class="w-60">
		{@const targets = list.targets(item)}
		<ContextMenu.Label class="text-muted-foreground truncate text-xs font-normal">
			{targets.length > 1 ? workspace.t('ui.ws.selected', { count: targets.length }) : label}
		</ContextMenu.Label>
		<ListMenuItems {list} items={targets} kind="context" />
	</ContextMenu.Content>
</ContextMenu.Root>
