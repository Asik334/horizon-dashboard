/**
 * Генерация сетки одиночного выбывания (single elimination).
 *
 * Подход: считаем ближайшую степень двойки >= числа участников, оставшиеся
 * слоты заполняем BYE (техническим проходом). BYE распределяются по
 * стандартной схеме посева (seed 1 против последнего слота и т.д.), чтобы
 * сильные по посеву участники не встречались с BYE подряд в верхних раундах
 * сильнее, чем со случайными соперниками — это стандартная практика турнирных
 * сеток (аналогично тому, как работают сетки в большинстве спортивных турниров).
 */

export interface BracketParticipant {
  id: string;
  seed: number; // 1-based, 1 = первый посев
}

export interface BracketMatchPlan {
  round: number; // 1-based
  position: number; // 0-based внутри раунда
  participantAId: string | null;
  participantBId: string | null;
  isBye: boolean;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Классический порядок посева для сетки размера `size` (степень двойки).
 * Возвращает массив длины size с 1-based номерами посева в порядке слотов
 * первого раунда (слот 0 против слота 1, слот 2 против слота 3, ...).
 */
function seedOrder(size: number): number[] {
  if (size === 1) return [1];
  const half = seedOrder(size / 2);
  const result: number[] = [];
  for (const seed of half) {
    result.push(seed, size + 1 - seed);
  }
  return result;
}

/**
 * participants должны быть отсортированы по посеву заранее (seed 1 — первый).
 * Возвращает план матчей первого раунда + пустые слоты всех следующих
 * раундов (participantA/BId = null, заполняются по мере прохождения BYE
 * и завершения матчей — см. advanceWinner в контроллере).
 */
export function generateSingleEliminationBracket(
  participants: BracketParticipant[]
): BracketMatchPlan[] {
  if (participants.length < 2) {
    throw new Error("Нужно минимум 2 участника для генерации сетки");
  }

  const size = nextPowerOfTwo(participants.length);
  const totalRounds = Math.log2(size);
  const order = seedOrder(size); // порядок посевов по слотам

  const bySeed = new Map(participants.map((p) => [p.seed, p]));

  const round1: BracketMatchPlan[] = [];
  for (let i = 0; i < size / 2; i++) {
    const seedA = order[i * 2];
    const seedB = order[i * 2 + 1];
    const a = bySeed.get(seedA) ?? null;
    const b = bySeed.get(seedB) ?? null;
    round1.push({
      round: 1,
      position: i,
      participantAId: a?.id ?? null,
      participantBId: b?.id ?? null,
      // BYE — если один из слотов пуст (реальных участников меньше, чем
      // ближайшая степень двойки), второй проходит дальше автоматически.
      isBye: !a || !b,
    });
  }

  const plan: BracketMatchPlan[] = [...round1];
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = size / Math.pow(2, round);
    for (let position = 0; position < matchesInRound; position++) {
      plan.push({
        round,
        position,
        participantAId: null,
        participantBId: null,
        isBye: false,
      });
    }
  }

  return plan;
}

/** Куда попадает победитель матча (round, position) в сетке single elimination. */
export function nextMatchSlot(round: number, position: number): { round: number; position: number; slot: "A" | "B" } {
  return {
    round: round + 1,
    position: Math.floor(position / 2),
    slot: position % 2 === 0 ? "A" : "B",
  };
}
