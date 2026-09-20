import type { Suite } from "../runner";
import { appetiteSuite } from "./appetite";
import { journeySuite } from "./case-journey";
import { discoverySuite } from "./discovery";
import { enrichmentSuite } from "./enrichment";
import { extractionSuite } from "./extraction";
import { guidelineSuite } from "./guidelines";
import { quoteSuite } from "./quote";
import { rankingSuite } from "./ranking";
import { resolutionSuite } from "./resolution";
import { similarCasesSuite } from "./similar-cases";
import { telemetrySuite } from "./telemetry";

export const suites: Suite[] = [extractionSuite, resolutionSuite, guidelineSuite, journeySuite, enrichmentSuite, discoverySuite, appetiteSuite, rankingSuite, quoteSuite, telemetrySuite, similarCasesSuite];
