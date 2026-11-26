#!/usr/bin/env node
/**
 * `bin/agents`: the argument-driven entry point. Node 24 strips the types, so this runs from the
 * installed sources with no build step and no npm dependency.
 */
import { main } from "./cli.ts";
import { installInterruptHandler } from "./interrupt.ts";
import { exitOnClosedPipe } from "./stdio.ts";

exitOnClosedPipe();
installInterruptHandler();
process.exitCode = await main(process.argv.slice(2));
