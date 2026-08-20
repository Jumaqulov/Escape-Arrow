/**
 * The tap coach belongs only to the opening campaign boards and disappears
 * permanently after the player completes the coached tap once.
 */
export function shouldShowTapTutorial(globalLevel: number, needsTutorial: boolean, isSpecial: boolean): boolean {
  return needsTutorial && !isSpecial && globalLevel <= 1;
}
