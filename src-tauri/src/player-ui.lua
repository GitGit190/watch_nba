local mp = require 'mp'
local function host(action) mp.commandv('script-message', 'courtside-ui', action) end
mp.add_forced_key_binding('SPACE', 'courtside-pause', function() mp.commandv('cycle', 'pause') end)
mp.add_forced_key_binding('LEFT', 'courtside-back', function() mp.commandv('seek', -5, 'relative') end)
mp.add_forced_key_binding('RIGHT', 'courtside-forward', function() mp.commandv('seek', 5, 'relative') end)
mp.add_forced_key_binding('m', 'courtside-mute', function() mp.commandv('cycle', 'mute') end)
mp.add_forced_key_binding('f', 'courtside-fullscreen', function() host('fullscreen') end)
mp.add_forced_key_binding('ESC', 'courtside-escape', function() host('escape') end)
mp.add_forced_key_binding('t', 'courtside-tabs', function() host('tabs') end)
mp.add_forced_key_binding('s', 'courtside-stats', function() host('stats') end)
mp.add_forced_key_binding('MBTN_LEFT_DBL', 'courtside-fullscreen-mouse', function() host('fullscreen') end)
-- The OSC fullscreen button must affect the Tauri host, not mpv's child HWND.
mp.observe_property('fullscreen', 'bool', function(_, value)
    if value then mp.set_property_bool('fullscreen', false); host('fullscreen') end
end)
