import { Type, type TSchema } from "typebox";
import type { ComputerUseToolName } from "./computer-use-tools";

export function createComputerUseParameterSchemas(): Record<ComputerUseToolName, TSchema> {
  const object = <T extends Record<string, TSchema>>(properties: T) =>
    Type.Object(properties, { additionalProperties: true });
  const app = Type.String({ description: "The application to inspect or control." });
  const appTarget = Type.String({
    description: "Application name, bundle id, .app path, executable path, PID string, or window owner name to resolve.",
  });
  const elementIndex = Type.String({
    pattern: "^[0-9]+$",
    description: "The target element index from the app state.",
  });
  const clickOptions = {
    click_count: Type.Optional(Type.Integer({
      minimum: 1,
      description: "The number of clicks to perform.",
    })),
    mouse_button: Type.Optional(stringEnum(["left", "right", "middle"], "The mouse button to click.")),
  };
  const click = Type.Union([
    object({
      app,
      element_index: elementIndex,
      ...clickOptions,
    }),
    object({
      app,
      element_index: Type.Optional(elementIndex),
      x: Type.Number({ description: "The x coordinate to click." }),
      y: Type.Number({ description: "The y coordinate to click." }),
      ...clickOptions,
    }),
  ]);

  return {
    computer_use_list_apps: Type.Object({}, { additionalProperties: false }),
    computer_use_get_app_state: object({
      app,
      disableDiff: Type.Optional(Type.Boolean({
        description: "Return a complete accessibility tree instead of a diff from the previous app state.",
      })),
    }),
    computer_use_click: click,
    computer_use_type_text: object({
      app,
      text: Type.String({ description: "The text to type. Non-ASCII text is pasted via the clipboard, or set directly on the field when element_index targets it." }),
      element_index: Type.Optional(elementIndex),
    }),
    computer_use_press_key: object({
      app,
      key: Type.String({ description: "The key or keyboard shortcut to press. Uses xdotool-style names: a, Return, BackSpace, Delete, Tab, super+c, Up, KP_0." }),
    }),
    computer_use_scroll: object({
      app,
      element_index: elementIndex,
      direction: stringEnum(["up", "down", "left", "right"], "The scroll direction."),
      pages: Type.Optional(Type.Number({ description: "The number of pages to scroll." })),
    }),
    computer_use_drag: object({
      app,
      from_x: Type.Number({ description: "The drag start x coordinate." }),
      from_y: Type.Number({ description: "The drag start y coordinate." }),
      to_x: Type.Number({ description: "The drag end x coordinate." }),
      to_y: Type.Number({ description: "The drag end y coordinate." }),
    }),
    computer_use_set_value: object({
      app,
      element_index: elementIndex,
      value: Type.String({ description: "The value to set." }),
    }),
    computer_use_select_text: object({
      app,
      element_index: elementIndex,
      text: Type.String({ description: "The text to select." }),
      selection: Type.Optional(stringEnum(
        ["text", "cursor_before", "cursor_after"],
        "The selection behavior.",
      )),
      prefix: Type.Optional(Type.String({ description: "Text before the target selection." })),
      suffix: Type.Optional(Type.String({ description: "Text after the target selection." })),
    }),
    computer_use_perform_secondary_action: object({
      app,
      element_index: elementIndex,
      action: Type.String({ description: "The secondary action to perform." }),
    }),
    computer_use_paste: object({
      app,
      format: stringEnum(["text", "md", "html"], "Content format: plain text, Markdown, or HTML."),
      text: Type.String({ description: "The content to paste into the current focus." }),
    }),
    computer_use_resolve_app: object({ app: appTarget }),
  };
}

function stringEnum(values: readonly string[], description: string): TSchema {
  return Type.Union(
    values.map((value) => Type.Literal(value)),
    { description },
  );
}
