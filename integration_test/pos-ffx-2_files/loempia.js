openerp.loempia = function(instance) {
    instance.loempia = {embed:{}};
    instance.web.client_actions.add("loempia.embed", "instance.loempia.embed.Embed");
    instance.web.client_actions.add("loempia.embed.updates", "instance.loempia.embed.Updates");


    instance.loempia.embed.get_version_info = function() {
        var self = instance.loempia.embed;
        var i0 = openerp.instances.instance0;

        if (_.isUndefined(self._version_info)) {
            return i0.session.rpc("/web/webclient/version_info", {}).then(function(version_info) {
                self._version_info = version_info;
                return self._version_info;
            });
        } else {
            return $.Deferred().resolve(self._version_info).promise();
        }
    };

    instance.loempia.embed.get_local_modules = function() {
        var self = instance.loempia.embed;
        var i0 = openerp.instances.instance0;

        if (_.isEmpty(self._local_modules)) {
            return self.get_version_info().then(function(version_info) {
                var M = new i0.web.Model('ir.module.module');
                // ignore the nightly-build timestamping, separated with a hyphen
                var server_version = version_info.server_version.split('-')[0];
                self._local_modules = {
                    openerp: {
                        name: 'openerp',
                        installed_version: server_version,
                        latest_version: server_version,
                        state: 'installed'
                    }
                };
                // attention: Incorrect field names !!
                //   installed_version refer the latest version (the one on disk)
                //   latest_version refer the installed version (the one in database)
                return M.query(['name', 'installed_version', 'latest_version', 'state']).all().then(function(result) {
                    _.each(result, function(m) {
                        if (m.name != 'base') {     // base is included into "openerp" module
                            self._local_modules[m.name] = m;
                        }
                    });
                    return self._local_modules;
                });
            });
        } else {
            return $.Deferred().resolve(self._local_modules).promise();
        }
    };

    instance.loempia.embed.get_dbuuid = function() {
        var self = instance.loempia.embed;
        var i0 = openerp.instances.instance0;
        if (_.isUndefined(self._dbuuid)) {
            var P = new i0.web.Model('ir.config_parameter');
            return P.call('get_param', ['database.uuid']).then(function(dbuuid) {
                self._dbuuid = dbuuid;
                return dbuuid;
            });
        } else {
            return $.Deferred().resolve(self._dbuuid).promise();
        }
    };

    instance.loempia.embed.download = function(modules) {
        var do_download = function() {
            var i0 = openerp.instances.instance0;
            var e = instance.loempia.embed;
            i0.web.blockUI();
            $.when(e.get_version_info(), e.get_local_modules(), e.get_dbuuid()).done(function() {
                var data = {
                    module_names: modules,
                    serie: e._version_info.server_serie,
                    local_modules: e._local_modules,
                    dbuuid: e._dbuuid
                };

                instance.session.rpc('/loempia/embed/download_urls', data).done(function(urls) {
                    e._local_modules = null;    // force reload of local modules
                    _.each(urls, function(u, m) {
                        if (u !== '') {
                            urls[m] = instance.session.origin + u;
                        }
                    });
                    var M = new i0.web.Model('ir.module.module');
                    var context = {};
                    // call_button is needed because it clean the action before returning it
                    // call_button need context as last arguments
                    M.call_button('install_from_urls', [urls, context]).always(function() {
                        i0.web.unblockUI();
                    }).done(function(action) {
                        if (!action) {
                            action = {
                                type: 'ir.actions.client',
                                tag: 'home',
                                params: {
                                    wait: true,
                                },
                            };
                        }
                        i0.webclient.action_manager.do_action(action);
                    });
                });
            });
        };

        if (instance.session.username !== 'anonymous') {
            do_download();
            return;
        }

        var IMD = new instance.web.Model('ir.model.data');
        return IMD.call('get_object_reference', ['auth_oauth', 'provider_openerp']).then(function(ref) {
            var Providers = new instance.web.Model('auth.oauth.provider');
            return Providers.call('read', [ref[1], ['client_id', 'scope', 'auth_endpoint']]).then(function(provider) {
                var e = instance.loempia.embed;
                return e.get_dbuuid().then(function(dbuuid) {
                    var i0 = openerp.instances.instance0;
                    var state = {
                        'h': i0.session.prefix,
                        'm': modules.join(','),
                        'd': instance.session.db,
                        'p': provider.id
                    };

                    var ret = instance.session.prefix + '/loempia/embed/signin';
                    if (i0.session.debug) {
                        ret += '?debug';
                    }

                    var params = {
                        response_type: 'token',
                        client_id: dbuuid,
                        redirect_uri: ret,
                        scope: 'userinfo apps',
                        state: JSON.stringify(state)
                    };
                    if (i0.session.debug) {
                        params.debug = true;
                    }
                    var url = provider.auth_endpoint + '?' + $.param(params);
                    window.location = url;
                });
            });
        });
    };


    instance.loempia.embed.update_needaction_count = function(count) {
        var self = instance.loempia.embed;
        var i0 = openerp.instances.instance0;

        var get_upd_menu_id = function() {
            if (_.isUndefined(self._upd_menu_id)) {
                var IMD = new i0.web.Model('ir.model.data');
                return IMD.call('get_object_reference', ['base', 'menu_module_updates']).then(function(r) {
                    var mid = r[1];
                    if(r[0] !== 'ir.ui.menu') {
                        // invalid reference, return null
                        mid = null;
                    }
                    self._upd_menu_id = mid;
                    return mid;
                });
            } else {
                return $.Deferred().resolve(self._upd_menu_id).promise();
            }
        };

        $.when(get_upd_menu_id()).done(function(menu_id) {
            if (_.isNull(menu_id)) {
                return;
            }
            var $menu = i0.client.menu.$secondary_menus.find(_.str.sprintf('a[data-menu=%s]', menu_id));
            if ($menu.length === 0) {
                return;
            }
            if (_.isUndefined(count)) {
                count = 0;
            }
            var needupdate = $menu.find('div.oe_menu_counter');
            if (needupdate && needupdate.length !== 0) {
                if (count > 0) {
                    needupdate.text(count);
                } else {
                    needupdate.remove();
                }
            } else if (count > 0) {
                $menu.append(i0.web.qweb.render("Menu.needaction_counter", {widget: {needaction_counter: count}}));
            }
        });
    };

    instance.loempia.embed.get_updates = function(fields) {
        var self = instance.loempia.embed;
        return self.get_local_modules().then(function(lm) {
            var installed = _.filter(lm, function(m) { return m.state === 'installed'; });
            var M = new instance.web.Model('loempia.module');
            var domain = [['name', 'in', _.pluck(installed, 'name')]];
            fields = _.union(['name', 'version'], fields || []);
            return M.query(fields).filter(domain).all().then(function(records) {
                var result = {};
                _.each(records, function(record) {
                    var localmod = lm[record.name];
                    if (localmod && localmod.installed_version !== record.version) {
                        result[record.name] = {
                            local: localmod,
                            remote: record
                        };
                    }
                });
                return result;
            });
        });

    };

    instance.loempia.embed.update_needaction = function() {
        var self = instance.loempia.embed;
        self.get_updates().done(function(updates) {
            var count = _.keys(updates).length;
            self.update_needaction_count(count);
        });
    };

    instance.loempia.embed.Embed = instance.web.Widget.extend({
        //*
        template: 'EmptyComponent',

        start: function() {
            // TODO add local addons (not on loempia)
            var self = this;
            var i0 = openerp.instances.instance0;
            var e = instance.loempia.embed;
            
            // GA tracking
            instance.client.tracker._push_pageview('/stats/apps_embed');
            
            // steal the params of the parent action
            var current_action = i0.client.action_manager.inner_action;

            // temporary workaround for bug 1105337
            if (!current_action || current_action.tag !== 'apps') {
                if (window.console) { console.error('Invalid current_action, skipping start'); }
                return $.when();
            }

            self.params = current_action.params || {};
            return e.get_version_info().done(function(version_info) {
                if (self.params.error) {
                    if (window.console) { console.error(self.params.error); }
                    i0.client.crashmanager.show_warning({
                        type: i0.web._t("Error"),
                        message: self.params.error,
                    });
                } else if (self.params.modules) {
                    var modules = self.params.modules;
                    if (_.isString(modules)) {
                        modules = modules.split(',');
                    }
                    e.download(modules);
                } else {
                    i0.web.blockUI();
                    self.do_action({
                        type: 'ir.actions.act_window',
                        name: 'OpenERP Apps',
                        res_model: 'loempia.module',
                        views: [[false, 'kanban'], [false, 'list'], [false, 'form']],
                        context: {
                            openerp_serie: version_info.server_serie,
                            search_default_app: true
                        },
                        domain: [['serie_id.name', '=', version_info.server_serie], ['category_id', '!=', 'Technical Settings']],
                        flags: {
                            action_buttons: false,
                            sidebar: false,
                        },
                        embedded: true
                    }, {
                        clear_breadcrumbs: true
                    }).always(function() {
                        i0.web.unblockUI();
                    }).done(function() {
                        // Alter "Custom Filter" View
                        if (instance.session.username === 'anonymous') {
                            // No custom filter creation for anonymous
                            $('.oe_searchview_custom:has(>form)').remove();
                        } else {
                            // No shared filter for others
                            $('#oe_searchview_custom_public, #oe_searchview_custom_public + label').remove();
                        }

                        e.update_needaction();
                    });
                }
            });
        },

    });



    instance.web_kanban.KanbanView.include({
        start: function() {
            if (this.dataset.model == 'loempia.module') {
                this.local_modules = {};
                this.embedded = this.getParent().action.embedded;
                if (this.embedded) {
                    var self = this,
                        e = instance.loempia.embed,
                        _super = this._super,
                        args = arguments;

                    return e.get_local_modules().then(function(lm) {
                        self.local_modules = lm;
                        return _super.apply(self, args);
                    });
                }
            }
            return this._super.apply(this, arguments);
        }

    });

    instance.web_kanban.KanbanRecord.include({
        bind_events: function() {
            var self = this;
            this.$('.oe_loempia_details button[name=install]').click(function() {
                 var local_mod = self.view.local_modules[self.record.name.raw_value];
                 if (_.isUndefined(local_mod) || self.record.version.raw_value != local_mod.installed_version) {
                     var e = instance.loempia.embed;
                     e.download([self.record.name.raw_value]);
                 } else {
                     // direct install local module
                     var i0 = openerp.instances.instance0;
                     var M = new i0.web.Model('ir.module.module');
                     var context = {};
                     M.call_button('button_immediate_install', [[local_mod.id], context]).done(function(action) {
                         if (!action) {
                             action = {
                                 type: 'ir.actions.client',
                                 tag: 'home',
                                 params: {
                                     wait: true,
                                 },
                             };
                         }
                         i0.webclient.action_manager.do_action(action);
                     });
                 }
            });
            return this._super.apply(this, arguments);
        }
    });



    instance.loempia.embed.Updates = instance.web.Widget.extend({
        template: 'loempia.updates',

        appendTo: function() {
            var self = this,
                _super = this._super,
                args = arguments,
                e = instance.loempia.embed,
                fields = ['name', 'version', 'shortdesc', 'release_date', 'changelog'];

            return e.get_updates(fields).then(function(updates) {
                e.update_needaction();
                self.updates = updates;
                return _super.apply(self, args);
            });
        },

        start: function() {
            this.$('button[name=update]').click(function() {
                var modules = $(this).data('modules').split(',');
                var e = instance.loempia.embed;
                e.download(modules);
            });
            return this._super();
        },

        image_link: function(record) {
             var url = instance.session.prefix + '/web/binary/image?session_id=' + this.session.session_id + '&model=loempia.module&id=' + record.id + '&field=icon_image&t=' + (new Date().getTime());
            return url;
        },

        0:0
    });
};
