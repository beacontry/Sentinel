// Renders the UI kit gallery to static HTML on stdout, for the harness
// mode of scripts/capture-redesign.mjs. No app, no database, no session:
// the gallery holds sample data only.
//
//   npx tsx --tsconfig scripts/tsconfig.render.json scripts/render-ui-kit.tsx > kit.html

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastProvider } from "@/components/ui/toast";
import { UiKitGallery } from "@/components/ui-kit/ui-kit-gallery";

process.stdout.write(renderToStaticMarkup(createElement(ToastProvider, null, createElement(UiKitGallery))));
