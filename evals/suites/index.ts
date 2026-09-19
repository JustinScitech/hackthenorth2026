import type { Suite } from "../runner";
import { appetiteSuite } from "./appetite";
import { journeySuite } from "./case-journey";
import { extractionSuite } from "./extraction";
import { guidelineSuite } from "./guidelines";
import { rankingSuite } from "./ranking";

export const suites: Suite[] = [extractionSuite, guidelineSuite, journeySuite, appetiteSuite, rankingSuite];
