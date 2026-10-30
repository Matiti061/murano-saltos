import { describe, expect, it } from 'vitest';
import { groupByPosition, sortPlayers } from '../db/players';
import { normalizeLegacyPlayer, normalizePosition, type Position } from '../db/types';

describe('posiciones', () => {
  it('ordena Armadora → Punta receptora → Opuesta → Central → Líbero y luego por nombre', () => {
    const players: { name: string; position: Position }[] = [
      { name: 'Ana', position: 'Líbero' },
      { name: 'Bea', position: 'Central' },
      { name: 'Zoe', position: 'Armadora' },
      { name: 'Carla', position: 'Opuesta' },
      { name: 'Eva', position: 'Punta receptora' },
      { name: 'Alba', position: 'Armadora' },
      { name: 'Dana', position: 'Punta receptora' },
    ];
    expect(sortPlayers(players).map((p) => `${p.position}:${p.name}`)).toEqual([
      'Armadora:Alba',
      'Armadora:Zoe',
      'Punta receptora:Dana',
      'Punta receptora:Eva',
      'Opuesta:Carla',
      'Central:Bea',
      'Líbero:Ana',
    ]);
    const groups = groupByPosition(players, (p) => p);
    expect(groups.map((g) => [g.position, g.items.length])).toEqual([
      ['Armadora', 2],
      ['Punta receptora', 2],
      ['Opuesta', 1],
      ['Central', 1],
      ['Líbero', 1],
    ]);
  });

  it('convierte los nombres antiguos de posición', () => {
    expect(normalizePosition('Colocadora')).toBe('Armadora');
    expect(normalizePosition('Receptora')).toBe('Punta receptora');
    expect(normalizePosition('Opuesta')).toBe('Opuesta');
    expect(normalizePosition('Central')).toBe('Central');
    expect(normalizePosition('Líbero')).toBe('Líbero');
  });

  it('migra una jugadora antigua quitando solo el dorsal', () => {
    const old = {
      id: 7,
      teamId: 1,
      name: 'Lucía Martín',
      number: 12,
      position: 'Colocadora',
      status: 'readaptacion',
      jumpLimit: 90,
      notes: 'Vuelta tras esguince',
      archived: 0,
      createdAt: 123,
    };
    expect(normalizeLegacyPlayer({ ...old })).toEqual({
      id: 7,
      teamId: 1,
      name: 'Lucía Martín',
      position: 'Armadora',
      status: 'readaptacion',
      jumpLimit: 90,
      notes: 'Vuelta tras esguince',
      archived: 0,
      createdAt: 123,
    });
  });
});
