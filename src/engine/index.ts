export { transform, MAX_INPUT_CHARS, type TransformOptions, type TransformResult } from './pipeline';
export { detectSource, type PastePayload, type SourceInfo } from './detect-source';
export { ADAPTERS } from './destinations/adapters';
export { choosePasteMode, detectDestination, destinationForHost, isDestinationId, type PasteMode } from './destinations/detect';
export {
  DEFAULT_FORMAT,
  type DestinationAdapter,
  type DestinationId,
  type FormatSettings,
  type PasteTarget,
} from './destinations/types';
export type { Note, NoteId } from './report';
export type { Doc, Block, Inline } from './model';
export { learnStyle, describeProfile, mergeProfiles } from './style/learn';
export type { StyleProfile } from './style/types';
