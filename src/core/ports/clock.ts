/**
 * Relogio e porta por um motivo concreto: o budget guard raciocina sobre
 * janelas de tempo, e testar janela de tempo com relogio real produz teste
 * que falha em horarios especificos.
 */
export interface Clock {
  now(): number;
}
