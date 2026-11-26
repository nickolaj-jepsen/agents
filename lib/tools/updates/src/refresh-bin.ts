#!/usr/bin/env node
/** `bin/agents-refresh`: rewrite one profile's managed entries from the resolved state. */
import { main } from "./refresh.ts";
import { exitOnClosedPipe } from "./stdio.ts";

exitOnClosedPipe();
process.exitCode = await main();
