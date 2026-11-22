# ProductIdentity

Every product has one colour, one icon and one catalog key; the hub is graphite.

## Markup

```svelte
import { PRODUCTS, productByKey } from '@codelinks/ui/products';
<html data-product="planer">  <span data-product={productByKey(key)?.slug}>…</span>
```

## Rules

- On `<html>` the product colour becomes the app's `primary`, `ring` and `sidebar-primary`.
- On any element `data-product` exposes `--product`, `--product-foreground` and `--product-text`.
- Status stays semantic: InfraLink shifts `destructive`, PlanerLink `success`, LokaLink dark `warning`.
- Navigation, tenants and members stay neutral; landing buttons stay graphite.

## Source

`product-theme.css`, `products/registry.ts`
