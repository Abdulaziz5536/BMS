const CONFIRM_ACTION_EVENT = "bms:confirm-action";

// Opens the shared confirm dialog from anywhere without passing modal state through every page.
export const confirmAction = (options = {}) => {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent(CONFIRM_ACTION_EVENT, {
        detail: {
          title: "Are you sure?",
          message: "This action cannot be undone.",
          confirmText: "Yes",
          cancelText: "No",
          resolve,
          ...options
        }
      })
    );
  });
};

export { CONFIRM_ACTION_EVENT };
