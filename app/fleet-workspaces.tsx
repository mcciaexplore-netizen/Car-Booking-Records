'use client';
import { useState, useEffect } from 'react';
import { ConnectionSetup, MappingEditor, StaffAccess } from './fleet-setup';
import {
  ExternalLink,
  Check,
  ArrowRight,
  Link2,
  RefreshCw,
  Users,
  History,
  SlidersHorizontal,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import type { SyncConfig } from '@/lib/zoho';

import { TableRow, TableCell } from '@/components/ui/table';

import { api, Picker, DataTable, Field, date } from './fleet-ui';

export function SettingsPanel({ busy, run, sync, fresh }: any) {
  const [settings, setSettings] = useState<any>(null),
    [settingsTab, setSettingsTab] = useState('connections'),
    [loadError, setLoadError] = useState(''),
    [syncDraft, setSyncDraft] = useState<SyncConfig | null>(null),
    [key, setKey] = useState('syncConfig'),
    [draft, setDraft] = useState('');
  useEffect(() => {
    let cancelled = false;
    api('settings')
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setSyncDraft(s.syncConfig);
        setDraft(JSON.stringify(s[key], null, 2));
        setLoadError('');
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  if (loadError)
    return (
      <div className="error-banner" role="alert">
        <AlertCircle size={18} />
        <span>{loadError}</span>
        <Button
          variant="outline"
          onClick={() => {
            setLoadError('');
            api('settings')
              .then((s) => {
                setSettings(s);
                setSyncDraft(s.syncConfig);
                setDraft(JSON.stringify(s[key], null, 2));
              })
              .catch((error) => setLoadError(error.message));
          }}
        >
          Try again
        </Button>
      </div>
    );
  if (!settings || !syncDraft)
    return <div className="panel">Loading connection settings…</div>;
  const save = () =>
    run(async () => {
      await api('settings', { key, value: JSON.parse(draft) });
      const latest = await api('settings');
      setSettings(latest);
      setSyncDraft(latest.syncConfig);
      setDraft(JSON.stringify(latest[key], null, 2));
    }, 'Configuration saved.');
  const canDiscover =
    settings.configured.zoho &&
    settings.syncConfig.allowanceVerified &&
    settings.syncConfig.dailyApiBudget > 0;
  const canImport = canDiscover && settings.syncConfig.mappings.length > 0;
  const steps = [
    {
      title: 'Server credentials',
      description: 'Stored privately',
      done: settings.configured.oauth?.configured,
    },
    {
      title: 'Verify access',
      description: 'Read-only authorization',
      done: settings.configured.oauth?.verified,
    },
    {
      title: 'Select application',
      description: 'Exact Creator link names',
      done: !!settings.application?.owner && !!settings.application?.app,
    },
    {
      title: 'Verify allowance',
      description: 'Account API budget',
      done: settings.syncConfig.allowanceVerified,
    },
    {
      title: 'Map reports',
      description: 'Inspected source fields',
      done: settings.syncConfig.mappings.length > 0,
    },
    {
      title: 'Import history',
      description: 'All selected pages',
      done: !!fresh.lastSuccess,
    },
    {
      title: 'Configure scheduler',
      description: 'Private trigger credentials',
      done: settings.configured.schedulerSecret,
    },
    {
      title: 'Observe trigger',
      description: 'Authenticated call recorded',
      done: !!settings.schedulerLastSeen,
    },
  ];
  const currentStep = steps.findIndex((step) => !step.done);
  return (
    <Tabs
      className="workspace-settings"
      value={settingsTab}
      onValueChange={(value) => setSettingsTab(String(value))}
    >
      <TabsList
        variant="line"
        aria-label="Settings sections"
        className="settings-tabs"
      >
        <TabsTrigger value="connections">
          <Link2 />
          Connections
        </TabsTrigger>
        <TabsTrigger value="sync">
          <SlidersHorizontal />
          Sync & rules
        </TabsTrigger>
        <TabsTrigger value="staff">
          <Users />
          Staff access
        </TabsTrigger>
        <TabsTrigger value="activity">
          <History />
          Activity
        </TabsTrigger>
      </TabsList>
      <TabsContent keepMounted value="connections">
        <section
          className="connection-journey"
          aria-label="Zoho connection progress"
        >
          <div className="section-heading">
            <div>
              <h2>Connect your fleet, step by step</h2>
              <p className="muted">
                Your records stay private. Zoho access is read-only.
              </p>
            </div>
            <span className="journey-progress">
              {steps.filter((step) => step.done).length} of {steps.length}{' '}
              complete
            </span>
          </div>
          <ol>
            {steps.map((step, index) => (
              <li
                key={step.title}
                className={
                  step.done
                    ? 'step-complete'
                    : index === currentStep
                      ? 'step-current'
                      : ''
                }
              >
                <span className="step-number">
                  {step.done ? (
                    <Check size={17} />
                  ) : (
                    String(index + 1).padStart(2, '0')
                  )}
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <ConnectionSetup
          settings={settings}
          refresh={async () => {
            const latest = await api('settings');
            setSettings(latest);
            setSyncDraft(latest.syncConfig);
          }}
          run={run}
          busy={busy}
          sync={sync}
        >
          <MappingEditor
            settings={settings}
            refresh={async () => {
              const latest = await api('settings');
              setSettings(latest);
              setSyncDraft(latest.syncConfig);
            }}
            run={run}
            busy={busy}
          />
        </ConnectionSetup>
        <details className="advanced-settings">
          <summary>Connection diagnostics and extraction policies</summary>
          <div className="settings-grid">
            <section className="panel">
              <div className="integration-heading">
                <span className="integration-symbol">
                  <Link2 size={24} />
                </span>
                <div>
                  <h2>Zoho Creator</h2>
                  <p className="muted">Vehicle records & approvals</p>
                </div>
                <span
                  className={
                    'badge ' + (settings.configured.zoho ? 'green' : 'neutral')
                  }
                >
                  {settings.configured.zoho
                    ? 'Configured'
                    : 'Setup in progress'}
                </span>
              </div>
              <p className="muted">
                Verify access, then discover the reports you want to import.
              </p>
              <dl className="setup-list">
                <dt>Zoho authorization</dt>
                <dd>
                  {settings.configured.oauth?.configured
                    ? 'Configured'
                    : 'Not configured'}
                </dd>
                <dt>Automatic access renewal</dt>
                <dd>
                  {settings.configured.oauth?.verified
                    ? 'Verified · renews when needed'
                    : settings.configured.oauth?.configured
                      ? 'Ready to verify'
                      : 'Awaiting credentials'}
                </dd>
                <dt>Creator application</dt>
                <dd>
                  {settings.configured.zoho
                    ? 'Configured'
                    : 'Application URL needed'}
                </dd>
                <dt>Report mappings</dt>
                <dd>{settings.syncConfig.mappings.length} mappings</dd>
                <dt>Last successful import</dt>
                <dd>{date(fresh.lastSuccess)}</dd>
                <dt>Scheduled trigger secret</dt>
                <dd>
                  {settings.configured.schedulerSecret
                    ? 'Configured; verify external trigger'
                    : 'Not configured'}
                </dd>
              </dl>
              <div className="review-actions">
                <Button
                  variant="outline"
                  disabled={busy || !settings.configured.oauth?.configured}
                  onClick={() =>
                    run(async () => {
                      await api('connection-test', {});
                      setSettings(await api('settings'));
                    }, 'Zoho access verified. Access tokens renew automatically when needed.')
                  }
                >
                  Check Zoho access
                </Button>
                <Button
                  disabled={busy || !canDiscover}
                  onClick={() =>
                    run(async () => {
                      await api('discover', {});
                      setSettings(await api('settings'));
                    }, 'Actual report and form metadata saved.')
                  }
                >
                  Discover reports
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !canImport}
                  onClick={sync}
                >
                  Import history
                </Button>
              </div>
              {!canDiscover && (
                <p className="action-hint">
                  {!settings.configured.zoho
                    ? 'Select your Creator application before discovering reports.'
                    : 'Set a verified API allowance in Sync & rules to continue.'}
                </p>
              )}
              <details className="advanced-disclosure">
                <summary>Report fields & discovered metadata</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run(async () => {
                      await api('fields', { form: f.get('form') });
                      setSettings(await api('settings'));
                    }, 'Form fields inspected.');
                  }}
                  className="inline-form"
                >
                  <Field label="Form link name from discovered metadata">
                    <Input name="form" required />
                  </Field>
                  <Button
                    variant="outline"
                    disabled={busy || !settings.metadata}
                  >
                    Inspect fields
                  </Button>
                </form>
                <details>
                  <summary>Discovered metadata</summary>
                  <pre className="json-view">
                    {JSON.stringify(
                      settings.metadata ?? {
                        status: 'Not inspected. No names assumed.',
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </details>
            </section>
            <div className="settings-aside">
              <section className="setup-help panel">
                <span className="welcome-kicker">YOUR NEXT STEP</span>
                <h2>
                  {!settings.configured.zoho
                    ? 'Find your application link'
                    : !canImport
                      ? 'Prepare your reports'
                      : fresh.lastSuccess
                        ? 'Keep your records up to date'
                        : 'Start your first import'}
                </h2>
                {!settings.configured.zoho ? (
                  <>
                    <p className="muted">
                      Open the application in Zoho Creator that contains MCCIA’s
                      vehicle records.
                    </p>
                    <ol>
                      <li>Open Zoho Creator and choose your application.</li>
                      <li>
                        Click <b>Access this application</b> if you are in the
                        editor.
                      </li>
                      <li>
                        Copy the address from your browser and share it with
                        your administrator.
                      </li>
                    </ol>
                    <p className="url-example">
                      creatorapp.zoho.in/<b>organisation</b>/<b>application</b>
                    </p>
                    <p className="muted">
                      The application link identifies your records. Keep
                      passwords and API keys out of these forms.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="muted">
                      Set the available API allowance, discover your reports,
                      then match their fields before importing.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setSettingsTab('sync')}
                    >
                      Open sync settings <ArrowRight size={15} />
                    </Button>
                  </>
                )}
              </section>
              <details className="panel processing-panel">
                <summary>Document processing & retention</summary>
                <h2>Extraction & data handling</h2>
                <p className="muted">
                  Azure Document Intelligence Layout receives uploaded pages and
                  returns text, tables, confidence and source coordinates.
                  Signature identity is never inferred.
                </p>
                <p className="muted">
                  Regional per-page charges need confirmation. Set the monthly
                  page budget, endpoint and server key before enabling. Pages
                  beyond the configured range need a separate upload.
                </p>
                <dl className="setup-list">
                  <dt>Automatic extraction</dt>
                  <dd>
                    {settings.configured.extraction ? 'Configured' : 'Disabled'}
                  </dd>
                  <dt>Original retention</dt>
                  <dd>
                    {settings.retention.originalDays
                      ? settings.retention.originalDays +
                        ' days; administrator purge'
                      : 'Retain until a policy is agreed'}
                  </dd>
                  <dt>External notifications</dt>
                  <dd>Disabled · authorization required</dd>
                </dl>
                <a
                  className="text-link"
                  href="https://azure.microsoft.com/en-us/pricing/details/document-intelligence/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Azure pricing <ExternalLink size={14} />
                </a>
              </details>
            </div>
          </div>
        </details>
      </TabsContent>
      <TabsContent keepMounted value="sync">
        <section className="panel sync-preferences">
          <div className="section-heading">
            <div>
              <h2>Sync preferences</h2>
              <p className="muted">
                Use the allowance available in your Zoho account.
              </p>
            </div>
            <RefreshCw size={20} />
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await api('settings', { key: 'syncConfig', value: syncDraft });
                const latest = await api('settings');
                setSettings(latest);
                setSyncDraft(latest.syncConfig);
                if (key === 'syncConfig')
                  setDraft(JSON.stringify(latest.syncConfig, null, 2));
              }, 'Sync preferences saved.');
            }}
          >
            <div className="form-grid">
              <Field label="Daily API request budget">
                <Input
                  type="number"
                  min="1"
                  max="100000"
                  required
                  value={syncDraft?.dailyApiBudget || ''}
                  placeholder="Enter your verified allowance"
                  onChange={(event) =>
                    setSyncDraft({
                      ...syncDraft,
                      dailyApiBudget: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Minimum sync interval (minutes)">
                <Input
                  type="number"
                  min="15"
                  required
                  value={syncDraft?.intervalMinutes ?? 60}
                  onChange={(event) =>
                    setSyncDraft({
                      ...syncDraft,
                      intervalMinutes: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <label
              className="allowance-check"
              htmlFor="verified-zoho-allowance"
            >
              <Checkbox
                id="verified-zoho-allowance"
                checked={syncDraft?.allowanceVerified ?? false}
                onCheckedChange={(checked) =>
                  setSyncDraft({ ...syncDraft, allowanceVerified: checked })
                }
              />
              <span>I have checked the available API allowance in Zoho.</span>
            </label>
            <p className="action-hint">
              The interval applies when a scheduler is connected. You can also
              sync manually.
            </p>
            <Button disabled={busy}>Save sync preferences</Button>
          </form>
        </section>
        <details className="advanced-settings">
          <summary>
            Advanced field mappings & policies
            <span>For your workspace administrator</span>
          </summary>
          <section className="panel configuration">
            <h2>Field mappings & policies</h2>
            <p className="muted">
              Explicit field mappings and policies. OAuth credentials and
              refresh tokens belong in server secrets.
            </p>
            <Picker
              value={key}
              onChange={setKey}
              label="Configuration category"
              options={[
                'syncConfig',
                'rules',
                'registerColumns',
                'extractionBudget',
                'retention',
                'notificationRules',
              ].map((v) => ({
                value: v,
                label: (
                  {
                    syncConfig: 'Report field mappings',
                    rules: 'Permission rules',
                    registerColumns: 'Register columns',
                    extractionBudget: 'Document processing budget',
                    retention: 'Record retention',
                    notificationRules: 'Alert rules',
                  } as Record<string, string>
                )[v],
              }))}
            />
            <Textarea
              aria-label="Configuration JSON"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={13}
              className="json-editor"
            />
            <Button disabled={busy} onClick={save}>
              Save configuration
            </Button>
          </section>
        </details>
      </TabsContent>
      <TabsContent keepMounted value="staff">
        <StaffAccess
          settings={settings}
          refresh={async () => setSettings(await api('settings'))}
          run={run}
          busy={busy}
        />
      </TabsContent>
      <TabsContent keepMounted value="activity">
        <section className="panel configuration">
          <h2>Synchronization history</h2>
          <DataTable
            headers={['Started', 'State', 'Mode', 'Pages / records', 'Details']}
            empty={!settings.runs.length}
            emptyTitle="No sync activity yet"
            emptyDescription="Your import history will appear here after the first sync."
          >
            {settings.runs.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{date(r.startedAt)}</TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell>{r.mode}</TableCell>
                <TableCell>
                  {r.pages} / {r.count}
                </TableCell>
                <TableCell>{r.error ?? '—'}</TableCell>
              </TableRow>
            ))}
          </DataTable>
        </section>
      </TabsContent>
    </Tabs>
  );
}
