from pathlib import Path

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk

from JsonSettingsWidgets import JSONSettingsIconChooser


ICON_DIR = Path(__file__).parent / "mdi-icons"


# add Home Assistant icons to icon path
_theme = Gtk.IconTheme.get_default()
_path = _theme.get_search_path()
if not _path or str(ICON_DIR) not in _path:
    # Using a "legacy feature" of the search path. This allows us to
    # simply have the icons directly in the directory. The proper way
    # would be to create an `index.theme` file and some kind of
    # directory structure.
    _theme.append_search_path(str(ICON_DIR))


class IconChooserWithLocalIcons(JSONSettingsIconChooser):
    def __init__(self, info, key, settings):
        info['default_category'] = "Home Assistant"
        super().__init__(key, settings, info)

        dialog = self.content_widget.get_dialog()
        dialog.add_custom_category("Home Assistant", [
            file.stem
            for file in ICON_DIR.iterdir()
            if file.is_file() and file.name.endswith("-symbolic.svg")
        ])
