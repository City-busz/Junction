import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gdk from "gi://Gdk";

import { relativePath, loadStyleSheet } from "./util.js";
import Entry from "./Entry.js";
import AppButton from "./AppButton.js";

export default function Window({ application, file }) {
  const builder = Gtk.Builder.new_from_file(relativePath("./window.ui"));

  const window = builder.get_object("window");
  loadStyleSheet(relativePath("./window.css"));
  window.set_application(application);

  let content_type = "application/octet-stream";
  let value = "";

  // g_file_get_uri_scheme() returns http for https so we need to use g_uri
  // const scheme = file.get_uri_scheme();
  const uri = GLib.uri_parse(file.get_uri(), GLib.UriFlags.NONE);
  const scheme = uri.get_scheme();

  if (scheme !== "file") {
    content_type = `x-scheme-handler/${scheme}`;
    value = file.get_uri();
  } else {
    value = file.get_path();
    try {
      const info = file.query_info(
        "standard::content-type",
        Gio.FileQueryInfoFlags.NONE,
        null,
      );
      content_type = info.get_content_type();
    } catch (err) {
      logError(err);
    }
  }

  const { entry } = Entry({
    entry: builder.get_object("entry"),
    value,
    scheme,
  });

  const applications = getApplications(content_type);
  log(applications.map((appInfo) => appInfo.get_name()));
  const list = builder.get_object("list");

  applications.forEach((appInfo) => {
    const { button } = AppButton({
      appInfo,
      content_type,
      entry,
      window,
    });
    appInfo.button = button;
    list.append(button);
  });

  function getAppForKeyval(keyval) {
    const keyname = Gdk.keyval_name(keyval);
    // Is not 0...9
    if (!/^\d$/.test(keyname)) return null;
    const appInfo = applications[+keyname - 1];
    return appInfo;
  }

  const eventController = new Gtk.EventControllerKey();
  eventController.connect("key-pressed", (self, keyval) => {
    const appInfo = getAppForKeyval(keyval);
    if (!appInfo) return false;
    appInfo.button.grab_focus();
    return true;
  });
  eventController.connect("key-released", (self, keyval) => {
    const appInfo = getAppForKeyval(keyval);
    if (!appInfo) return false;
    appInfo.button.activate();
    return true;
  });
  window.add_controller(eventController);

  function copyToClipboard() {
    const display = Gdk.Display.get_default();
    const clipboard = display.get_clipboard();
    clipboard.set(entry.get_text());
  }
  const copy = new Gio.SimpleAction({
    name: "copy",
    parameter_type: null,
  });
  copy.connect("activate", copyToClipboard);
  window.add_action(copy);

  window.present();

  return { window };
}

const excluded_apps = [
  // Exclude self for obvious reason
  "re.sonny.Junction.desktop",
  // Braus is similar to Junction
  "com.properlypurple.braus.desktop",
  // SpaceFM handles urls for some reason
  // https://github.com/properlypurple/braus/issues/26
  // https://github.com/IgnorantGuru/spacefm/blob/e6f291858067e73db44fb57c90e4efb97b088ac8/data/spacefm.desktop.in
  "spacefm.desktop",
];

function getApplications(content_type) {
  const applications = Gio.AppInfo.get_recommended_for_type(content_type);

  return applications.filter((appInfo) => {
    return appInfo.should_show() && !excluded_apps.includes(appInfo.get_id());
  });
}
