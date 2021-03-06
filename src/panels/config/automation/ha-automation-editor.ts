import {
  LitElement,
  TemplateResult,
  html,
  CSSResult,
  css,
  PropertyDeclarations,
  PropertyValues,
} from "lit-element";
import "@polymer/app-layout/app-header/app-header";
import "@polymer/app-layout/app-toolbar/app-toolbar";
import "@polymer/paper-icon-button/paper-icon-button";
import { classMap } from "lit-html/directives/class-map";

import { h, render } from "preact";

import "../../../components/ha-fab";
import "../../../components/ha-paper-icon-button-arrow-prev";
import "../../../layouts/ha-app-layout";

import Automation from "../js/automation";
import unmountPreact from "../../../common/preact/unmount";
import computeStateName from "../../../common/entity/compute_state_name";

import { haStyle } from "../../../resources/styles";
import { HomeAssistant } from "../../../types";
import {
  AutomationEntity,
  AutomationConfig,
  deleteAutomation,
} from "../../../data/automation";
import { navigate } from "../../../common/navigate";
import { computeRTL } from "../../../common/util/compute_rtl";
import "../../lovelace/components/hui-yaml-editor.ts";
// This is not a duplicate import, one is for types, one is for element.
// tslint:disable-next-line
import { HuiYamlEditor } from "../../lovelace/components/hui-yaml-editor";
import yaml from "js-yaml";
import { fireEvent } from "../../../common/dom/fire_event";

function AutomationEditor(mountEl, props, mergeEl) {
  return render(h(Automation, props), mountEl, mergeEl);
}

class HaAutomationEditor extends LitElement {
  public hass!: HomeAssistant;
  public automation!: AutomationEntity;
  public isWide?: boolean;
  public creatingNew?: boolean;
  private _config?: AutomationConfig;
  private _dirty?: boolean;
  private _rendered?: unknown;
  private _errors?: string;
  private _showYaml: boolean;
  private _yaml?: string;

  static get properties(): PropertyDeclarations {
    return {
      hass: {},
      automation: {},
      creatingNew: {},
      isWide: {},
      _errors: {},
      _dirty: {},
      _config: {},
      _showYaml: {},
    };
  }

  constructor() {
    super();
    this._showYaml = false;
    this._configChanged = this._configChanged.bind(this);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._rendered) {
      unmountPreact(this._rendered);
      this._rendered = undefined;
    }
  }

  protected render(): TemplateResult | void {
    if (!this.hass) {
      return;
    }
    return html`
      <ha-app-layout has-scrolling-region>
        <app-header slot="header" fixed>
          <app-toolbar>
            <ha-paper-icon-button-arrow-prev
              @click=${this._backTapped}
            ></ha-paper-icon-button-arrow-prev>
            <div main-title>
              ${this.automation
                ? computeStateName(this.automation)
                : this.hass.localize(
                    "ui.panel.config.automation.editor.default_name"
                  )}
            </div>
            <paper-icon-button
              icon="mdi:code-braces"
              @click=${this._toggleYaml}
            ></paper-icon-button>
            ${this.creatingNew
              ? ""
              : html`
                  <paper-icon-button
                    icon="hass:delete"
                    @click=${this._delete}
                  ></paper-icon-button>
                `}
          </app-toolbar>
        </app-header>

        <div class="content">
          ${this._errors
            ? html`
                <div class="errors">${this._errors}</div>
              `
            : ""}
          ${this._showYaml
            ? html`
                <hui-yaml-editor
                  .hass=${this.hass}
                  .value=${this._yaml}
                  @yaml-changed=${this._handleYamlChanged}
                ></hui-yaml-editor>
              `
            : html`
                <div
                  id="root"
                  class="${classMap({
                    rtl: computeRTL(this.hass),
                  })}"
                ></div>
              `}
        </div>
        <ha-fab
          slot="fab"
          ?is-wide="${this.isWide}"
          ?dirty="${this._dirty}"
          icon="hass:content-save"
          .title="${this.hass.localize(
            "ui.panel.config.automation.editor.save"
          )}"
          @click=${this._saveAutomation}
          class="${classMap({
            rtl: computeRTL(this.hass),
          })}"
        ></ha-fab>
      </ha-app-layout>
    `;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    const oldAutomation = changedProps.get("automation") as AutomationEntity;
    if (
      changedProps.has("automation") &&
      this.automation &&
      this.hass &&
      // Only refresh config if we picked a new automation. If same ID, don't fetch it.
      (!oldAutomation ||
        oldAutomation.attributes.id !== this.automation.attributes.id)
    ) {
      this.hass
        .callApi<AutomationConfig>(
          "GET",
          `config/automation/config/${this.automation.attributes.id}`
        )
        .then(
          (config) => {
            // Normalize data: ensure trigger, action and condition are lists
            // Happens when people copy paste their automations into the config
            for (const key of ["trigger", "condition", "action"]) {
              const value = config[key];
              if (value && !Array.isArray(value)) {
                config[key] = [value];
              }
            }
            this._dirty = false;
            this._config = config;
            this._setYamlFromConfig(config);
          },
          (resp) => {
            alert(
              resp.status_code === 404
                ? this.hass.localize(
                    "ui.panel.config.automation.editor.load_error_not_editable"
                  )
                : this.hass.localize(
                    "ui.panel.config.automation.editor.load_error_unknown",
                    "err_no",
                    resp.status_code
                  )
            );
            history.back();
          }
        );
    }

    if (changedProps.has("creatingNew") && this.creatingNew && this.hass) {
      this._dirty = false;
      this._config = {
        alias: this.hass.localize(
          "ui.panel.config.automation.editor.default_name"
        ),
        trigger: [{ platform: "state" }],
        condition: [],
        action: [{ service: "" }],
      };
    }

    if (
      (changedProps.has("_config") || changedProps.has("_showYaml")) &&
      this.hass
    ) {
      if (!this._showYaml) {
        this._rendered = AutomationEditor(
          this.shadowRoot!.querySelector("#root"),
          {
            automation: this._config,
            onChange: this._configChanged,
            isWide: this.isWide,
            hass: this.hass,
            localize: this.hass.localize,
          },
          this._rendered
        );
      } else if (this._yamlEditor && changedProps.has("_showYaml")) {
        this._yamlEditor.codemirror.refresh();
        this._yamlEditor.codemirror.focus();
        fireEvent(this as HTMLElement, "iron-resize");
      }
    }
  }

  private _configChanged(config: AutomationConfig): void {
    // onChange gets called a lot during initial rendering causing recursing calls.
    if (!this._rendered) {
      return;
    }
    this._config = config;
    this._setYamlFromConfig(config);
    this._errors = undefined;
    this._dirty = true;
  }

  private _backTapped(): void {
    if (
      this._dirty &&
      !confirm(
        this.hass!.localize("ui.panel.config.automation.editor.unsaved_confirm")
      )
    ) {
      return;
    }
    history.back();
  }

  private async _delete() {
    if (!confirm("Are you sure you want to delete this automation?")) {
      return;
    }
    await deleteAutomation(this.hass, this.automation.attributes.id!);
    history.back();
  }

  private _saveAutomation(): void {
    const id = this.creatingNew
      ? "" + Date.now()
      : this.automation.attributes.id;
    this.hass!.callApi(
      "POST",
      "config/automation/config/" + id,
      this._config
    ).then(
      () => {
        this._dirty = false;

        if (this.creatingNew) {
          navigate(this, `/config/automation/edit/${id}`, true);
        }
      },
      (errors) => {
        this._errors = errors.body.message;
        throw errors;
      }
    );
  }

  private _toggleYaml(): void {
    // Block switching from YAML -> GUI if there is an error in the YAML
    if (this._showYaml && this._errors) {
      alert(
        this.hass!.localize("ui.panel.config.automation.editor.yaml_error")
      );
    } else {
      this._showYaml = !this._showYaml;
    }
  }

  private _setYamlFromConfig(config: AutomationConfig) {
    // Strip ID
    // @ts-ignore
    delete config.id;
    this._yaml = yaml.safeDump(config);
  }

  private get _yamlEditor(): HuiYamlEditor | null {
    return this.shadowRoot!.querySelector("hui-yaml-editor");
  }

  private _handleYamlChanged(ev): void {
    ev.stopPropagation();
    try {
      this._config = yaml.safeLoad(ev.detail.value);
      this._dirty = true;
      this._errors = undefined;
    } catch (exception) {
      this._errors = exception;
    }
  }

  static get styles(): CSSResult[] {
    return [
      haStyle,
      css`
        ha-card {
          overflow: hidden;
        }
        .errors {
          padding: 20px;
          font-weight: bold;
          color: var(--google-red-500);
        }
        .content {
          padding-bottom: 20px;
        }
        .triggers,
        .script {
          margin-top: -16px;
        }
        .triggers ha-card,
        .script ha-card {
          margin-top: 16px;
        }
        .add-card mwc-button {
          display: block;
          text-align: center;
        }
        .card-menu {
          position: absolute;
          top: 0;
          right: 0;
          z-index: 1;
          color: var(--primary-text-color);
        }
        .rtl .card-menu {
          right: auto;
          left: 0;
        }
        .card-menu paper-item {
          cursor: pointer;
        }
        span[slot="introduction"] a {
          color: var(--primary-color);
        }
        ha-fab {
          position: fixed;
          bottom: 16px;
          right: 16px;
          z-index: 1;
          margin-bottom: -80px;
          transition: margin-bottom 0.3s;
        }

        ha-fab[is-wide] {
          bottom: 24px;
          right: 24px;
        }

        ha-fab[dirty] {
          margin-bottom: 0;
        }

        ha-fab.rtl {
          right: auto;
          left: 16px;
        }

        ha-fab[is-wide].rtl {
          bottom: 24px;
          right: auto;
          left: 24px;
        }
      `,
    ];
  }
}

customElements.define("ha-automation-editor", HaAutomationEditor);
