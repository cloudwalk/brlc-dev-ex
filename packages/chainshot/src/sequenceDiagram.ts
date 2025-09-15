import { stringifyValue } from "./utils.js";
import { Scenario } from "./Scenario.js";

function sanitizeMermaidLabel(text: string): string {
  return String(text).replace(/"/g, "'");
}

function extractTransfers(events: { name: string; contract: string; args: unknown[] }[]) {
  interface Transfer { from: string; to: string; amount: string; token: string }
  const transfers: Transfer[] = [];
  for (const evt of events) {
    if (evt.name !== "Transfer" || !Array.isArray(evt.args) || evt.args.length < 3) continue;
    const [from, to, amount] = evt.args as [unknown, unknown, unknown];
    transfers.push({
      from: stringifyValue(from),
      to: stringifyValue(to),
      amount: stringifyValue(amount),
      token: evt.contract,
    });
  }
  return transfers;
}

function collectEntities(scenario: Scenario) {
  const actors = new Set<string>();
  const participants = new Set<string>();
  const ensure = (name: string | undefined) => {
    if (!name) return;
    if (name) participants.add(name);
  };
  for (const log of scenario.logs) {
    actors.add(String(log.caller));
    ensure(log.contract);
    const transfers = extractTransfers((log.events || []) as { name: string; contract: string; args: unknown[] }[]);
    for (const t of transfers) {
      ensure(t.from);
      ensure(t.to);
      // ensure(t.token);
    }
  }
  // remove actors from participants to avoid duplicate declarations
  for (const a of actors) participants.delete(a);
  return { actors: Array.from(actors).sort(), participants: Array.from(participants).sort() };
}

export function renderSequenceDiagram(scenario: Scenario): string {
  const lines: string[] = [];
  lines.push("sequenceDiagram");
  // lines.push("  autonumber");
  const { actors, participants } = collectEntities(scenario);
  for (const a of actors) lines.push(`  actor ${sanitizeMermaidLabel(a)}`);
  for (const p of participants) lines.push(`  participant ${sanitizeMermaidLabel(p)}`);

  scenario.logs.forEach((log) => {
    const caller = sanitizeMermaidLabel(String(log.caller));
    const contract = sanitizeMermaidLabel(String(log.contract));
    const title = `${caller} calls ${contract}.${sanitizeMermaidLabel(String(log.name))}`;
    // Green action box with token arrows inside
    lines.push("  rect rgb(230,255,230)");
    // lines.push(`    Note over ${caller},${contract}: ${title}`);
    lines.push(`    ${caller}->>${contract}: ${title}`);
    const orderedEvents = (log.events || []) as { contract: string; name: string; args: unknown[] }[];
    for (const evt of orderedEvents) {
      if (evt.contract in scenario.config.tokens && evt.name === "Transfer") {
        const [fromRaw, toRaw, amountRaw] = evt.args as [unknown, unknown, unknown];
        const from = sanitizeMermaidLabel(stringifyValue(fromRaw));
        const to = sanitizeMermaidLabel(stringifyValue(toRaw));
        const amount = sanitizeMermaidLabel(stringifyValue(amountRaw));
        lines.push(`    ${from}-->>${to}: ${evt.contract}.Transfer: ${from} -> ${to} (${amount})`);
      } else {
        const evtContract = sanitizeMermaidLabel(evt.contract);
        const evtTitle = `${evt.contract}.${evt.name}`;
        lines.push(`    Note over ${evtContract}: ${sanitizeMermaidLabel(evtTitle)}`);
      }
    }
    lines.push("  end");
  });
  return lines.join("\n");
}
