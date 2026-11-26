#!/usr/bin/env node
/**
 * `bin/agents`: the argument-driven entry point. Node 24 strips the types, so this runs from the
 * installed sources with no build step and no npm dependency.
 */
import { main } from "./cli.ts";
import { exitOnClosedPipe } from "./stdio.ts";

exitOnClosedPipe();
process.exitCode = await main(process.argv.slice(2));
