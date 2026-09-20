import type { Suite } from "../runner";
import { appetiteSuite } from "./appetite";
import { briefQualitySuite } from "./brief-quality";
import { journeySuite } from "./case-journey";
import { counterfactualSuite } from "./counterfactual";
import { discoverySuite } from "./discovery";
import { enrichmentSuite } from "./enrichment";
import { extractionSuite } from "./extraction";
import { guidelineSuite } from "./guidelines";
import { quoteSuite } from "./quote";
import { rankingSuite } from "./ranking";
import { resolutionSuite } from "./resolution";
import { similarCasesSuite } from "./similar-cases";
import { telemetrySuite } from "./telemetry";
import { verifierSuite } from "./verifier";

export const suites: Suite[] = [extractionSuite, resolutionSuite, guidelineSuite, journeySuite, enrichmentSuite, discoverySuite, verifierSuite, briefQualitySuite, appetiteSuite, rankingSuite, counterfactualSuite, quoteSuite, telemetrySuite, similarCasesSuite];
