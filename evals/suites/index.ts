import type { Suite } from "../runner";
import { appetiteSuite } from "./appetite";
import { journeySuite } from "./case-journey";
import { enrichmentSuite } from "./enrichment";
import { extractionSuite } from "./extraction";
import { guidelineSuite } from "./guidelines";
import { quoteSuite } from "./quote";
import { rankingSuite } from "./ranking";
import { resolutionSuite } from "./resolution";
import { telemetrySuite } from "./telemetry";

export const suites: Suite[] = [extractionSuite, resolutionSuite, guidelineSuite, journeySuite, enrichmentSuite, appetiteSuite, rankingSuite, quoteSuite, telemetrySuite];
