// The page: a sentence of today, the session on the clock or the field that starts one, a year of focus minutes,
// the weekly report and the sessions of the day picked on the heatmap. It reads the service's state through a
// store, so a session started from the island, the launcher or an agent shows here.
import { Button, Chart, Column, Heatmap, List, Metadata, Page, Progress, Row, Scroll, Section, Segmented, Text, TextField, Timer, Tokens } from "@wallive/sdk";
import { useMemo, useState, useSyncExternalStore } from "react";
import { addDays, clock, dayOf, iso } from "./clock";
import { appOptions, resolveApp, titled } from "./distractions";
import * as focus from "./focus";
import { weekOf, type Ledger } from "./stats";
import { dayTitle, minutes, phaseName, shortDay, t, weekday } from "./strings";

const YEAR = 371;
const LENGTHS = ["15", "25", "45", "60"];

const report = (e: unknown) => console.error(String(e));

function Summary({ ledger, today }: { ledger: Ledger; today: string }) {
  const day = ledger.day(today);
  const sentence =
    day.minutes === 0
      ? ledger.sessions.length === 0
        ? t("page.first")
        : t("page.today.none")
      : day.finished === 0
        ? t("page.today.unfinished", { minutes: minutes(day.minutes) })
        : t("page.today", { minutes: minutes(day.minutes), n: day.finished });
  const streak = ledger.currentStreak(today);
  const week = weekOf(today);
  const weekMinutes = ledger.span(week.days[6]!, 7).minutes;
  const parts = [streak > 0 ? t("page.streak", { n: streak }) : null, weekMinutes > 0 ? t("page.week", { minutes: minutes(weekMinutes) }) : null].filter(
    (p): p is string => p !== null,
  );
  return (
    <Column gap={4}>
      <Text style="title">{sentence}</Text>
      {parts.length > 0 ? (
        <Text tone="secondary">{parts.length === 2 ? t("joined", { a: parts[0]!, b: parts[1]! }) : parts[0]!}</Text>
      ) : null}
    </Column>
  );
}

function Starter({ length, setLength }: { length: string; setLength: (v: string) => void }) {
  const [label, setLabel] = useState(focus.state.lastLabel);
  const start = () => void focus.startFocus(Number(length), label).catch(report);
  const options = LENGTHS.includes(String(focus.focusMinutes())) ? LENGTHS : [...LENGTHS, String(focus.focusMinutes())].sort((a, b) => Number(a) - Number(b));
  return (
    <Row gap={12} align="center">
      <TextField id="label" placeholder={t("page.label.placeholder")} value={label} onChange={setLabel} onSubmit={start} width="fill" />
      <Segmented
        id="length"
        title={t("page.length")}
        value={length}
        options={options.map((m) => ({ value: m, title: minutes(Number(m)) }))}
        onChange={setLength}
      />
      <Button id="start" role="primary" icon="play" title={t("button.start")} onClick={start} />
    </Row>
  );
}

function Running({ run }: { run: focus.Run }) {
  const paused = run.end === null;
  const isBreak = run.phase !== "focus";
  const round = t("round", { n: (focus.state.round % focus.every()) + 1, every: focus.every() });
  const when = paused ? t("paused") : t("ends", { time: clock(run.end!) });
  const head = isBreak ? when : t("joined", { a: round, b: when });
  const caption = !isBreak && run.drifts > 0 ? t("joined", { a: head, b: t("drifts", { n: run.drifts }) }) : head;
  const tone = paused ? "secondary" : isBreak ? "green" : "primary";
  return (
    <Column gap={12}>
      <Row gap={16} align="center">
        <Column gap={4} width="fill">
          <Text style="heading" lines={1}>{isBreak ? phaseName(run.phase) : run.label || phaseName("focus")}</Text>
          <Text style="caption" tone="secondary">{caption}</Text>
        </Column>
        {paused ? <Timer value={Math.round(run.left / 1000)} style="title" tone={tone} /> : <Timer end={iso(run.end!)} style="title" tone={tone} />}
      </Row>
      {paused ? <Progress value={1 - run.left / run.length} /> : <Progress start={iso(run.end! - run.length)} end={iso(run.end!)} />}
      <Row gap={8}>
        {paused ? (
          <Button id="resume" icon="play" title={t("button.resume")} onClick={() => void focus.resume().catch(report)} />
        ) : (
          <Button id="pause" icon="pause" title={t("button.pause")} onClick={() => void focus.pause().catch(report)} />
        )}
        <Button id="stop" icon="stop" title={t("button.stop")} onClick={() => void focus.stop().catch(report)} />
        {isBreak ? <Button id="skip" icon="next" title={t("button.skip")} onClick={() => void focus.skip().catch(report)} /> : null}
      </Row>
    </Column>
  );
}

function WeekReport({ ledger, today }: { ledger: Ledger; today: string }) {
  const [offset, setOffset] = useState("0");
  const week = weekOf(today, Number(offset));
  const span = ledger.span(week.sunday, 7);
  const labels = ledger.topLabels(week.sunday, 7);
  const points: [string, number][] = week.days.map((d) => [weekday(d), Math.round(ledger.day(d).minutes)]);
  const most = Math.max(60, ...points.map(([, m]) => m));
  const best = ledger.bestStreak(today, YEAR);
  const average = span.activeDays > 0 ? span.minutes / span.activeDays : 0;
  return (
    <Section id="report" title={t("page.report")} gap={16}>
      <Row gap={12} align="center">
        <Text tone="secondary" width="fill">{`${shortDay(week.monday)} – ${shortDay(week.sunday)}`}</Text>
        <Segmented
          id="week"
          style="tabs"
          value={offset}
          options={[
            { value: "-1", title: t("page.last-week") },
            { value: "0", title: t("page.this-week") },
          ]}
          onChange={setOffset}
        />
      </Row>
      <Row gap={32} align="start">
        <Column gap={8} width="fill">
          <Chart marks={[{ mark: "bar", points, color: "indigo9", name: t("page.report.focus") }]} yDomain={[0, Math.ceil(most / 30) * 30]} yLabel={t("unit.minutes")} legend={false} height={180} />
          {span.minutes === 0 ? <Text style="caption" tone="secondary">{t("page.report.empty")}</Text> : null}
        </Column>
        <Column gap={16} width={240}>
          <Metadata
            rows={[
              { label: t("page.report.focus"), value: minutes(span.minutes) },
              { label: t("page.report.sessions"), value: t("page.report.sessions.value", { n: span.finished }) },
              { label: t("page.report.average"), value: minutes(average) },
              { label: t("page.report.best"), value: t("page.report.days.value", { n: best }) },
              { label: t("page.report.drifts"), value: t("page.report.drifts.value", { n: span.drifts }) },
            ]}
          />
          {labels.length > 0 ? <Metadata title={t("page.report.labels")} rows={labels.map((l) => ({ label: l.label, value: minutes(l.minutes) }))} /> : null}
        </Column>
      </Row>
    </Section>
  );
}

function History({ ledger, day, length }: { ledger: Ledger; day: string; length: string }) {
  const sessions = ledger.sessionsOn(day);
  return (
    <Section id="history-section" title={dayTitle(day)} count={sessions.length > 0 ? sessions.length : undefined} gap={8}>
      <List
        id="history"
        items={sessions.map((s) => {
          const range = t("page.history.range", { from: clock(s.start), to: clock(s.end) });
          const notes = [range, s.finished ? null : t("page.history.stopped"), s.drifts > 0 ? t("drifts", { n: s.drifts }) : null].filter(
            (n): n is string => n !== null,
          );
          return {
            id: s.id,
            icon: s.finished ? "check" : "stop",
            title: s.label || t("page.history.untitled"),
            subtitle: notes.reduce((a, b) => t("joined", { a, b })),
            trailing: minutes(s.minutes),
          };
        })}
        empty={
          <Column gap={12} align="start">
            <Text tone="secondary">{t("page.history.empty")}</Text>
            {day === dayOf() && !focus.state.run ? (
              <Button id="history-start" icon="play" title={t("button.start")} onClick={() => void focus.startFocus(Number(length)).catch(report)} />
            ) : null}
          </Column>
        }
      />
    </Section>
  );
}

/** The apps a switch to counts as a drift: a menu of the installed apps, open ones first, and any typed name. */
function DistractingApps() {
  const options = useMemo(appOptions, []);
  const known = new Set(options.map((o) => o.value));
  const change = (list: { value: string; title?: string }[]) =>
    void focus.updateDistractions(list.map((a) => (known.has(a.value) ? { value: a.value, title: a.title ?? a.value } : resolveApp(a.value)))).catch(report);
  return (
    <Section id="apps-section" title={t("page.apps")} gap={12}>
      <Text tone="secondary">{focus.driftOn() ? t("page.apps.on") : t("page.apps.off")}</Text>
      <Tokens id="apps" value={titled()} options={options} placeholder={t("page.apps.placeholder")} onChange={change} />
    </Section>
  );
}

function FocusIsland() {
  const version = useSyncExternalStore(focus.subscribe, focus.snapshot);
  const today = dayOf();
  const [picked, setPicked] = useState(today);
  const [length, setLength] = useState(String(focus.focusMinutes()));
  const ledger = focus.state.ledger;
  const values = useMemo(() => ledger.heatmap(today, YEAR).map((m) => [m]), [ledger, today, version]);
  const run = focus.state.run;
  const day = picked > today || picked < addDays(today, -(YEAR - 1)) ? today : picked;

  return (
    <Page>
      <Scroll>
        <Column gap={32}>
        <Column id="today" gap={20}>
          <Summary ledger={ledger} today={today} />
          {run ? <Running run={run} /> : <Starter length={length} setLength={setLength} />}
        </Column>
        <Section id="year-section" title={t("page.year")} gap={12}>
          <Heatmap id="year" end={today} values={values} unit={t("unit.minutes")} series={[{ title: t("page.report.focus"), color: "indigo" }]} value={day} onChange={setPicked} />
        </Section>
        <WeekReport ledger={ledger} today={today} />
        <History ledger={ledger} day={day} length={length} />
        <DistractingApps />
        </Column>
      </Scroll>
    </Page>
  );
}

export const FocusPage = () => <FocusIsland />;
