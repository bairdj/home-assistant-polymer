import { html } from '@polymer/polymer/lib/utils/html-tag.js';
import { PolymerElement } from '@polymer/polymer/polymer-element.js';

import '../../../components/ha-card.js';
import '../components/hui-image.js';

import computeDomain from '../../../common/entity/compute_domain.js';
import computeStateDisplay from '../../../common/entity/compute_state_display.js';
import computeStateDomain from '../../../common/entity/compute_state_domain.js';
import computeStateName from '../../../common/entity/compute_state_name.js';
import toggleEntity from '../common/entity/toggle-entity.js';

import LocalizeMixin from '../../../mixins/localize-mixin.js';

const OFFLINE = 'Offline';

/*
 * @appliesMixin LocalizeMixin
 */
class HuiPictureEntityCard extends LocalizeMixin(PolymerElement) {
  static get template() {
    return html`
      <style>
        ha-card {
          cursor: pointer;
          min-height: 75px;
          overflow: hidden;
          position: relative;
        }
        .box {
          @apply --paper-font-common-nowrap;
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.3);
          padding: 16px;
          font-size: 16px;
          line-height: 16px;
          color: white;
          display: flex;
          justify-content: space-between;
        }
        #title {
          font-weight: 500;
        }
      </style>

      <ha-card on-click="_cardClicked">
        <hui-image 
          hass="[[hass]]" 
          image="[[_config.image]]" 
          state-image="[[_config.state_image]]" 
          camera-image="[[_config.camera_image]]" 
          state="[[_getStateObj(_oldState)]]"
        ></hui-image>
        <div class="box">
          <div id="title"></div>
          <div id="state"></div>
        </div>
      </ha-card>
    `;
  }

  static get properties() {
    return {
      hass: {
        type: Object,
        observer: '_hassChanged'
      },
      _config: Object,
    };
  }

  getCardSize() {
    return 3;
  }

  setConfig(config) {
    if (!config || !config.entity || (!config.image && !config.state_image)) {
      throw new Error('Error in card configuration.');
    }
    this._config = config;
  }

  _hassChanged(hass) {
    const config = this._config;
    const entityId = config && config.entity;
    if (!entityId) {
      return;
    }
    if (!(entityId in hass.states) && this._oldState === OFFLINE) {
      return;
    }
    if (!(entityId in hass.states) || hass.states[entityId].state !== this._oldState) {
      this._updateState(hass, entityId, config);
    }
  }

  _updateState(hass, entityId, config) {
    const state = entityId in hass.states ? hass.states[entityId].state : OFFLINE;

    this.$.title.innerText = config.title || (state === OFFLINE ?
      entityId : computeStateName(hass.states[entityId]));
    this.$.state.innerText = state === OFFLINE ?
      OFFLINE : this._computeState(hass.states[entityId]);
    this._oldState = state;
  }

  _computeState(stateObj) {
    const domain = computeStateDomain(stateObj);
    switch (domain) {
      case 'scene':
        return this.localize('ui.card.scene.activate');
      case 'script':
        return this.localize('ui.card.script.execute');
      case 'weblink':
        return 'Open';
      default:
        return computeStateDisplay(this.localize, stateObj);
    }
  }

  _cardClicked() {
    const entityId = this._config && this._config.entity;
    if (!(entityId in this.hass.states)) {
      return;
    }

    const domain = computeDomain(entityId);
    if (domain === 'weblink') {
      window.open(this.hass.states[entityId].state);
    } else {
      toggleEntity(this.hass, entityId);
    }
  }

  _getStateObj() {
    return this.hass && this.hass.states[this._config.entity];
  }
}

customElements.define('hui-picture-entity-card', HuiPictureEntityCard);