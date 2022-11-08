import { MATCH } from "./constants.mjs";
import {
  _getBonusesApplyingToSelf,
  _getTokenFromActor
} from "./helpers/helpers.mjs";
import { getAurasThatApplyToMe } from "./helpers/auraHelpers.mjs";
import { _getAllValidTemplateAuras } from "./helpers/templateHelpers.mjs";

/**
 * An example bonus, as it would be stored on an actor, effect, item, or template.
 * Includes all fields.
 *
  flags.babonus.bonuses: {
    <id>: {
      enabled: true,
      id: "hgienfid783h", // regular 16 character id
      type: "attack", // or "damage", "save", "throw", "hitdie"
      aura: {
        enabled: true,    // whether this is an aura.
        isTemplate: true, // whether this is a template aura, not a regular aura.
        range: 60,        // the range of the aura (in ft), not relevant if template.
        self: false,      // whether the aura affects the owner, too
        disposition: 1    // or -1 for non-allies. What token actors within range to affect.
        blockers: ["dead", "unconscious"] // array of conditions that stop auras from being transferred. Not relevant if template.
      },
      name: "Special Fire Spell Bonus",
      description: "This is a special fire spell bonus.",
      bonuses: {
        bonus: "1d4 + @abilities.int.mod",  // all types, but 'save' only takes numbers, not dice.
        criticalBonusDice: "5",             // strings that evaluate to numbers only (including rollData), 'damage' only
        criticalBonusDamage: "4d6 + 2"      // any die roll, 'damage' only
        deathSaveTargetValue: "12",         // strings that evaluate to numbers only (including rollData), 'throw' only
        criticalRange: "1",                 // a value (can be roll data) that lowers the crit range. 'attack' only.
        fumbleRange: "3"                    // a value (can be roll data) that raises the fumble range. 'attack' only.
      },

      filters: {
        // UNIVERSAL:
        arbitraryComparison: [
          {one: "@item.uses.value", other: "@abilities.int.mod", operator: "EQ"},
          {one: "@item.uses.value", other: "@abilities.int.mod", operator: "EQ"},
        ],
        statusEffects: ["blind", "dead", "prone", "mute"], // array of 'flags.core.statusId' strings to match effects against
        targetEffects: ["blind", "dead", "prone", "mute"], // array of 'flags.core.statusId' strings to match effects on the target against
        creatureTypes: ["undead", "humanoid", "construct"] // array of CONFIG.DND5E.creatureTypes, however, this is not strict to allow for subtype/custom.
        itemRequirements: { // for bonuses stored on items only.
          equipped: true,
          attuned: false
        },

        // ATTACK, DAMAGE:
        attackTypes: ["mwak", "rwak", "msak", "rsak"],

        // ATTACK, DAMAGE, SAVE:
        damageTypes: ["fire", "cold", "bludgeoning"],
        abilities: ["int"],
        saveAbilities: ["int", "cha", "con"],
        itemTypes: ["spell", "weapon", "feat", "equipment", "consumable"],

        // THROW:
        throwTypes: ["con", "int", "death", "concentration"],

        // SPELL:
        spellComponents: {
          types: ["concentration", "vocal"],
          match: "ALL" // or 'ANY'
        },
        spellLevels: ['0','1','2','3','4','5','6','7','8','9'],
        spellSchools: ["evo", "con"],

        // WEAPON
        baseweapons: ["dagger", "lance", "shortsword"],
        weaponProperties: {
          needed: ["fin", "lgt"],
          unfit: ["two", "ver"]
        }
      }
    }
  }
 */

export class FILTER {

  // hitdie rolls
  static hitDieCheck(actor) {
    const bonuses = _getBonusesApplyingToSelf(actor, "hitdie");
    const t = _getTokenFromActor(actor);
    if (t) bonuses.push(...getAurasThatApplyToMe(t, "hitdie"));
    if (t) bonuses.push(..._getAllValidTemplateAuras(t, "hitdie"));
    if (!bonuses.length) return [];
    return this.finalFilterBonuses(bonuses, actor, "misc");
  }

  // saving throws (isConcSave for CN compatibility)
  static throwCheck(actor, abilityId, { isConcSave }) {
    const bonuses = _getBonusesApplyingToSelf(actor, "throw");
    const t = _getTokenFromActor(actor);
    if (t) bonuses.push(...getAurasThatApplyToMe(t, "throw"));
    if (t) bonuses.push(..._getAllValidTemplateAuras(t, "throw"));
    if (!bonuses.length) return [];
    return this.finalFilterBonuses(bonuses, actor, "throw", {
      throwType: abilityId,
      isConcSave
    });
  }


  // attack rolls, damage rolls, displayCards (save dc)
  static itemCheck(item, hookType) {
    const bonuses = _getBonusesApplyingToSelf(item.parent, hookType);
    const t = _getTokenFromActor(item.parent);
    if (t) bonuses.push(...getAurasThatApplyToMe(t, hookType));
    if (t) bonuses.push(..._getAllValidTemplateAuras(t, hookType));
    if (!bonuses.length) return [];
    return this.finalFilterBonuses(bonuses, item, "item");
  }

  /**
   * Filters the collected array of bonuses. Returns the reduced array.
   */
  static finalFilterBonuses(bonuses, object, type, details = {}) {
    const valids = foundry.utils.duplicate(bonuses).reduce((acc, [id, values]) => {
      if (!values.enabled) return acc;
      for (const filter of Object.keys(values.filters ?? {})) {
        const validity = this[filter](object, values.filters[filter], details);
        if (!validity) return acc;
      }
      acc.push(values.bonuses);
      return acc;
    }, []);
    return valids;
  }

  /**
   * Find out if the item's type is one of the valid ones in the filter.
   *
   * @param {Item5e} item     The item being filtered against.
   * @param {Array} filter    The array of item type keys.
   * @returns {Boolean}       Whether the item's type was in the filter.
   */
  static itemTypes(item, filter) {
    if (!filter?.length) return true;
    return filter.includes(item.type);
  }

  /**
   * Find out if the item's base weapon type is one of the valid ones in the filter.
   *
   * @param {Item5e} item     The item being filtered against.
   * @param {Array} filter    The array of weapon baseItem keys.
   * @returns {Boolean}       Whether the item's baseItem was in the filter.
   */
  static baseWeapons(item, filter) {
    if (!filter?.length) return true;
    // only weapons can be a type of weapon...
    if (item.type !== "weapon") return false;
    return filter.includes(item.system.baseItem);
  }

  /**
   * Find out if the item has any of the filter's damage types in its damage.parts.
   *
   * @param {Item5e} item     The item being filtered against.
   * @param {Array} filter    The array of damage types.
   * @returns {Boolean}       Whether the item's damage types overlap with the filter.
   */
  static damageTypes(item, filter) {
    if (!filter?.length) return true;

    const damageTypes = item.getDerivedDamageLabel().some(i => {
      return filter.includes(i.damageType);
    });
    return damageTypes;
  }

  /**
   * Find out if the item is a spell and belongs to one of the filter's spell schools.
   *
   * @param {Item5e} item     The item being filtered against.
   * @param {Array} filter    The array of spell schools.
   * @returns {Boolean}       Whether the item is a spell and is of one of these schools.
   */
  static spellSchools(item, filter) {
    if (!filter?.length) return true;
    if (item.type !== "spell") return false;
    return filter.includes(item.system.school);
  }

  /**
   * Find out if the item is using one of the abiities in the filter.
   * Special consideration is made for items set to 'Default' to look for
   * finesse weapons and spellcasting abilities.
   * Note that this is the ability set at the top level of the item's action,
   * and is NOT the ability used to determine the saving throw DC.
   *
   * @param {Item5e} item     The item being filtered against.
   * @param {Array} filter    The array of abilities.
   * @returns {Boolean}       Whether item is using one of the abilities.
   */
  static abilities(item, filter) {
    if (!filter?.length) return true;

    const { actionType, ability, properties } = item.system;

    // if the item has no actionType, it has no ability.
    if (!actionType) return false;

    /**
     * Special consideration for items set to use 'Default'.
     * This is sometimes an empty string, and sometimes null,
     * but should always be falsy.
     */
    if (!ability) {
      const { abilities, attributes } = item.actor.system;

      /**
       * If a weapon is Finesse, then a bonus applying to Strength
       * or Dexterity should apply if and only if the relevant
       * modifier is higher than the other.
       */
      if (item.type === "weapon" && properties.fin) {
        const str = abilities.str.mod;
        const dex = abilities.dex.mod;
        if (filter.includes("str") && str >= dex) return true;
        if (filter.includes("dex") && dex >= str) return true;
      }

      /**
       * If the action type is a melee weapon attack, then a bonus
       * applying to Strength should apply.
       */
      if (actionType === "mwak" && filter.includes("str")) return true;

      /**
       * If the action type is a ranged weapon attack, then a bonus
       * applying to Dexterity should apply.
       */
      if (actionType === "rwak" && filter.includes("dex")) return true;

      /**
       * If the action type is a melee or ranged spell attack, or a saving throw,
       * then bonuses applying to the actor's spellcasting ability should apply.
       *
       * Unless explicitly set to something different, the ability for a saving throw
       * is always the spellcasting ability, no matter the item type.
       */
      if (["msak", "rsak", "save"].includes(actionType)) {
        if (filter.includes(attributes.spellcasting)) return true;
      }
    }

    return filter.includes(ability);
  }

  /**
   * Find out if the item is a spell and has any, or all, of the required spell components.
   * The item must match either ALL or at least one, depending on what is set.
   *
   * @param {Item5e} item     The item being filtered against.
   * @param {Array} types     The array of spell components in the filter.
   * @param {String} match    The type of matching, either ALL or ANY.
   * @returns {Boolean}       Whether the item had any/all of the components.
   */
  static spellComponents(item, { types, match }) {
    if (!types?.length) return true;
    if (item.type !== "spell") return false;

    const { components } = item.system;

    /**
     * If the item must match all of the components in the filter,
     * then the filter is a (proper) subset of the spell's components.
     */
    if (match === MATCH.ALL) return types.every(type => components[type]);
    /**
     * If the item must match at least one of the components in the filter,
     * then at least one element of the filter must be found in the spell's components.
     */
    else if (match === MATCH.ANY) return types.some(type => components[type]);

    return false;
  }

  /**
   * Find out if the item was cast at any of the required spell levels.
   * If a spell is upcast, the item is the cloned spell, so the level of the item
   * is always the level at which it was cast.
   *
   * @param {Item5e} item     The item being filtered against.
   * @param {Array} filter    The array of spell levels in the filter.
   * @returns {Boolean}       Whether the item is of one of the appropriate levels.
   */
  static spellLevels(item, filter) {
    if (!filter?.length) return true;
    if (item.type !== "spell") return false;
    const level = Number(item.system.level);
    return filter.map(i => Number(i)).includes(level);
  }

  /**
   * Find out if the item's action type is set to any of the required types.
   *
   * @param {Item5e} item     The item being filtered against.
   * @param {Array} filter    The array of attack types.
   * @returns {Boolean}       Whether the item has any of the required attack types.
   */
  static attackTypes(item, filter) {
    if (!filter?.length) return true;
    const actionType = item.system.actionType;
    if (!actionType) return false;
    return filter.includes(actionType);
  }

  /**
   * Find out if the item has any of the needed weapon properties, while having none
   * of the unfit properties. Such as only magical weapons that are not two-handed.
   *
   * @param {Item5e} item     The item being filtered against.
   * @param {Array} needed    The weapon properties that the item must have at least one of.
   * @param {Array} unfit     The weapon properties that the item must have none of.
   * @returns {Boolean}       Whether the item has any of the needed properties, and none of the unfit properties.
   */
  static weaponProperties(item, { needed, unfit }) {
    if (!needed?.length && !unfit?.length) return true;
    if (item.type !== "weapon") return false;

    const { properties } = item.system;

    if (unfit?.length) {
      const isUnfit = unfit.some((p) => properties[p]);
      if (isUnfit) return false;
    }

    if (needed?.length) {
      const isFit = needed.some((p) => properties[p]);
      if (!isFit) return false;
    }

    return true;
  }

  /**
   * Find out if the saving throw in the item is set using an ability in the filter.
   * This filter is only available for bonuses applying specifically to saving throw DCs.
   * Special consideration is made for items with save DC set using spellcasting ability.
   *
   * @param {Item5e} item     The item being filterd against.
   * @param {Array} filter    The ability that is used to set the DC of the item's saving throw.
   * @returns {Boolean}       Whether the item's saving throw is set using an ability in the filter.
   */
  static saveAbilities(item, filter) {
    if (!filter?.length) return true;

    const scaling = item.system.save?.scaling;
    const { spellcasting } = item.actor.system.attributes;
    if (!scaling) return false;

    // if the item is set to use spellcasting ability for the DC.
    if (scaling === "spell") {
      return filter.includes(spellcasting);
    }

    return filter.includes(scaling);
  }

  /**
   * Return whether ONE and OTHER have the correct relation.
   * If the two values do not evaluate to numbers, string comparison
   * will be used instead. Here 'less than' and 'less than or equal'
   * will mean 'is a substring'. String comparison happens after
   * replacing any rollData attributes.
   *
   * @param {Item5e|Actor5e} object   The item or actor being filtered against.
   * @param {Array} filter            An array of objects with one, other, operator.
   */
  static arbitraryComparison(object, filter) {
    if (!filter?.length) return true;

    const rollData = object.getRollData();
    const target = game.user.targets.first();
    if (target) rollData.target = target.actor.getRollData();

    for (const { one, other, operator } of filter) {
      // This method immediately returns false if invalid data somehow.
      if (!one || !other) return false;

      const left = Roll.replaceFormulaData(one, rollData);
      const right = Roll.replaceFormulaData(other, rollData);

      try {
        // try comparing numbers.
        const nLeft = Roll.safeEval(left);
        const nRight = Roll.safeEval(right);
        if (operator === "EQ" && !(nLeft === nRight)) return false;
        else if (operator === "LT" && !(nLeft < nRight)) return false;
        else if (operator === "GT" && !(nLeft > nRight)) return false;
        else if (operator === "LE" && !(nLeft <= nRight)) return false;
        else if (operator === "GE" && !(nLeft >= nRight)) return false;
      } catch {
        // try comparing strings.
        if (operator === "EQ" && !(left == right)) return false;
        else if (["LT", "LE"].includes(operator) && !(right.includes(left))) return false;
        else if (["GT", "GE"].includes(operator) && !(left.includes(right))) return false;
      }
    }
    return true;
  }

  /**
   * Find out if the actor has any of the status conditions required.
   * The bonus will apply if the actor has at least one.
   *
   * @param {Item5e|Actor5e} object The item or actor being filtered against.
   * @param {Array} filter          The array of effect status ids.
   * @returns {Boolean}             Whether the actor has any of the status effects.
   */
  static statusEffects(object, filter) {
    if (!filter?.length) return true;
    const obj = object.parent ?? object;
    return filter.some(id => {
      return !!obj.effects.find(eff => {
        if (eff.disabled || eff.isSuppressed) return false;
        return eff.getFlag("core", "statusId") === id;
      });
    });
  }

  /**
   * Find out if the target actor has any of the status conditions required.
   * The bonus will apply if the target actor exists and has at least one.
   *
   * @param {Item5e|Actor5e} object The item or actor. Not relevant in this case.
   * @param {Array} filter          The array of effect status ids.
   * @returns {Boolean}             Whether the target actor has any of the status effects.
   */
  static targetEffects(object, filter) {
    if (!filter?.length) return true;
    const target = game.user.targets.first();
    if (!target) return false;
    return filter.some(id => {
      return target.actor.effects.find(eff => {
        if (eff.disabled || eff.isSuppressed) return false;
        return eff.getFlag("core", "statusId") === id;
      });
    });
  }

  /**
   * Find out if the bonus should apply to this type of saving throw.
   *
   * @param {Actor5e} actor         The actor making the saving throw.
   * @param {Array}   filter        The array of saving throw types to check for.
   * @param {String}  throwType     The id of the ability, can be 'death'.
   * @param {Booolean}  isConcSave  Whether the saving throw is a conc save (if CN enabled).
   * @returns {Boolean} Whether the throw type is in the filter.
   */
  static throwTypes(actor, filter, { throwType, isConcSave }) {
    if (!filter?.length) return true;
    if (!throwType) return false;
    return filter.includes(throwType) || (filter.includes("concentration") && isConcSave);
  }

  /**
   * Find out if your target is one of the listed creature types.
   *
   * @param {Actor5e|Item5e} object  The item or actor. Not relevant in this case.
   * @param {Array} filter           The array of creature types to check for.
   */
  static creatureTypes(object, filter) {
    if (!filter?.length) return true;
    const target = game.user.targets.first();
    if (!target) return false;
    const { value, subtype, custom } = target.actor.system.details?.type ?? {};
    return filter.includes(value) || filter.includes(subtype.toLowerCase()) || filter.includes(custom.toLowerCase());
  }
}
