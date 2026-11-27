/// <reference types="vite/client" />
/// <reference types="react-router" />
/// <reference types="@shopify/oxygen-workers-types" />
/// <reference types="@shopify/hydrogen/react-router-types" />

// Enhance TypeScript's built-in typings.
import '@total-typescript/ts-reset';
declare global {
  interface Env {
    ACQUISITION_MODE?: string;
    ACQUISITION_VISITOR_TTL_SECONDS?: string;
    ACQUISITION_EXPERIENCE_VERSION?: string;
    CABINET_ROOMS_URL?: string;
    CABINET_ROOMS_TOKEN?: string;
  }
}
