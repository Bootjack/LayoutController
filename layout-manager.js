var addZoneButton = document.getElementById('add-zone-button'),
    root = document.getElementById('root-layout-container'),
    layout,
    saveLayoutButton = document.getElementById('save-layout-button'),
    savedLayout,
    restoreLayoutButton = document.getElementById('restore-layout-button'),
    zoneClasses = ['luna', 'deimos', 'phobos', 'io', 'ganymede'],
    zoneClassIncrementer = 0;

// Simple utility for navigating an object property path using a dot-notation string, just like getObj()
function safeProp (obj, path) {
    return path.split('.').reduce(function (nested, prop) {
        return nested[prop] || false;
    }, obj);
}

function makeDummyContent () {
    var classIndex, element;
    
    element = document.createElement('div');

    classIndex = (new Date().getTime() + zoneClassIncrementer++) % zoneClasses.length;
    element.className = 'dummy-content ' + zoneClasses[classIndex];
    
    return element;
}

// Constructor for the top-level layout
function LayoutController (config) {
    this.element = document.createElement('div');
    this.element.className = 'layout-manager--container';
    
    this.isResizeAllowed = (config.allowResize !== false);
    
    if (config.layoutMap) {
        this.restore(config.layoutMap);
    } else {
        this.createRootZone();
        this.updateAddresses();
    }
        
    if (config.parent) {
        this.attachTo(config.parent);
    }
    
    this.element.addEventListener('click', this.handleClick.bind(this));
}

LayoutController.prototype = {
    // Generic DOM helper any object supporting obj.element and obj.parent
    attachTo: function (parentElement) {
        parentElement.appendChild(this.element);
        this.parent = parentElement;
        return this;
    },
    
    // Create a new group at the given address; may have direction of 'row' or 'column'
    addGroup: function (address, config, isRestoring) {
        var group, zone;
        config = config || {};
        config.address = address;
        config.allowResize = this.isResizeAllowed;
        zone = this.getZone(address) || this.addZone(address);
        if (zone) {
            // When a root zone creates a group, we need to create two so that the layout may be expanded in either direction
            if ('0' === zone.address && !isRestoring) {
                group = zone.addGroup({
                    direction: ('row' === config.direction ? 'column' : 'row')
                });
                this.updateAddresses();
                group = group.zones[0].addGroup(config);
            } else {
                group = zone.addGroup(config);
            }
            this.updateAddresses();
        }
        return group;
    },
    
    // Create a new zone at the given address; works by finding and delegating to the appropriate group
    addZone: function (address, config) {
        var group, index, zone;
        
        config = config || {};
        config.address = address;
        index = parseInt(address.split('.').pop(), 10);
        group = this.getGroup(address.replace(/\.\d+$/, ''));
        
        if (group && !isNaN(index)) {
            zone = group.addZone(config, index);
            this.updateAddresses();
        }
        
        return zone;
    },
    
    // Collapses the zone at the given address; works by finding and delegating to the appropriate zone
    collapseZone: function (address) {
        var group, index, zone;
        zone = this.getZone(address);
        if (zone) {
            zone.collapse();
        }
        return zone;
    },
    
    createRootZone: function () {
        this.rootZone = new LayoutZone({
            address: '0',
            parent: this.element
        });
        return this.rootZone;
    },
    
    // Expands the zone at the given address; works by finding and delegating to the appropriate zone
    expandZone: function (address, config) {
        var group, index, zone;
        config = config || {};
        zone = this.getZone(address);
        if (zone) {
            zone.expand(config.revertSize);
        }
        return zone;
    },
    
    // Recursively lookup a group at the given address
    getGroup: function (address) {
        address = address.toString().replace(/\./g, '.childGroup.zones.') + '.childGroup';
        return safeProp([this.rootZone], address);
    },
    
    getLayoutMap: function (zone) {
        var result;
        zone = zone || this.rootZone;
        result = {
            address: zone.address,
            isCollapsed: zone.isCollapsed,
            minSize: zone.minSize,
            size: zone.size,
        };
        if (zone.childGroup) {
            result.type = 'group';
            result.direction = zone.childGroup.direction;
            result.zones = zone.childGroup.zones.map(this.getLayoutMap.bind(this));
        } else {
            result.type = 'zone';
        }
        
        if (zone === this.rootZone) {
            result.isRoot = true;
        }
        return result;
    },
    
    // Recursively lookup a zone at the given address
    getZone: function (address) {
        address = address.toString().replace(/\./g, '.childGroup.zones.');
        return safeProp([this.rootZone], address);
    },
    
    handleClick: function (evt) {
        if (/^remove\-zone\-button$/.test(evt.target.className)) {
            this.handleRemoveZoneClick(evt);
        }
    },
    handleRemoveZoneClick: function (evt) {
        var address = evt.target.getAttribute('data-address');
        this.removeZone(address);
    },
    
    // Remove a zone at the given address; works by finding and delegating to the appropriate group
    removeZone: function (address) {
        var group, index;
        index = address.split('.').pop();
        group = this.getGroup(address.replace(/\.\d+$/, ''));
        group.removeZone(index);
        if (1 === group.zones.length) {
            group.zones[0].removeGroup();
        }
        this.updateAddresses();
        return this;
    },
    
    reset: function () {
        if (this.rootZone) {
            this.rootZone.destroy();
            delete this.rootZone;
        }
        this.createRootZone();
    },
    
    restore: function (layoutMap) {
        var zone, restore = this.restore.bind(this);
        
        if (layoutMap.isRoot) {
            this.reset();
            layoutMap.parent = this.element;
        }
        
        if (layoutMap.type === 'group') {
            this.addGroup(layoutMap.address, layoutMap, true);
            layoutMap.zones.forEach(function (zoneMap) {
                restore(zoneMap);
            });
        } else if (layoutMap.type === 'zone') {
            zone = this.getZone(layoutMap.address) || this.addZone(layoutMap.address, layoutMap);
            if (zone) {
                zone.configure(layoutMap);
            }
        }
    },
    
    // Performs a hierarchical walk through all zones and updates their addresses, starting from the root layout group
    updateAddresses: function () {
        if (this.rootZone.childGroup) {
            this.rootZone.childGroup.updateAddresses(this.rootZone.address);
        }
        return this;
    }
};

// Constructor for linear set of LayoutZones
function LayoutGroup (config) {
    config = config || {};
    this.element = document.createElement('div');
    this.element.className = (config.direction === 'column' ? 'layout-manager--column' : 'layout-manager--row');
    this.direction = config.direction || 'row';
    this.dividers = [];
    this.isResizeAllowed = (config.allowResize !== false);
    this.zones = [];
    this.resizingZones = [];
        
    if (config.parent) {
        this.attachTo(config.parent);
    }
    
    this.element.addEventListener('mousemove', this.handleResizeMove.bind(this));
    this.element.addEventListener('mouseup', this.handleResizeEnd.bind(this));
}

LayoutGroup.prototype = {
    // Reuses the generic attachTo method from LayoutController
    attachTo: LayoutController.prototype.attachTo,
    
    // Creates a new zone and adds it to the group at the given index, or at the end if no index is given
    addZone: function (config, index) {
        var zone, dividerPair;
        config = config || {};
        config.parent = this.element;
        zone = new LayoutZone(config);
        if (0 === index) {
            this.element.insertBefore(zone.element, this.zones[0].element);
            this.zones.unshift(zone);
            this.addDivider(this.zones.slice(0, 2));
        } else if (index > 0 && index < this.zones.length) {
            this.element.insertBefore(zone.element, this.zones[index].element);
            this.zones.splice(index, 0, zone);
            this.removeDivider(this.zones.slice(index, index + 2));
            this.addDivider(this.zones.slice(index - 1, index + 1));
            this.addDivider(this.zones.slice(index, index + 2));
        } else {
            this.zones.push(zone);
            this.element.appendChild(zone.element);
            if (this.zones.length > 1) {
                this.addDivider(this.zones.slice(-2));
            }
        }
        return zone;
    },
    addDivider: function (zones) {
        var divider;
        if (2 === zones.length) {
            divider = new LayoutDivider({
                allowResize: (this.isResizeAllowed !== false),
                handleResizeStart: this.handleResizeStart,
                parent: this,
                zones: zones
            });
            divider.registerResizeStartListener(this, this.handleResizeStart);
            this.dividers.push(divider);
        }
        return divider;
    },
    
    destroy: function () {
        this.dividers.concat(this.zones).forEach(function (child) {
            child.destroy();
        });
    },
    // Find the divider between two zones at the given address in format "0.3.1-2"
    getDivider: function (zones) {
        var divider;
        this.dividers.some(function (div) {
            if (-1 !== div.zones.indexOf(zones[0]) || -1 !== div.zones.indexOf(zones[1])) {
                divider = div;
                return true;
            }
        });
        return divider;
    },
    
    getPositionProp: function () {
        return ('column' === this.direction ? 'screenY' : 'screenX');
    },
    
    getSizeProp: function () {
        return ('column' === this.direction ? 'height' : 'width');
    },
    
    getZoneRatio: function (pixels, zone) {
        var zoneSize = this.getZoneSize(zone);
        return Math.min(1, pixels / zoneSize);
    },
    
    getZoneSize: function (zone) {
        var boundingClientRect, sizeProp;
        boundingClientRect = zone.element.getBoundingClientRect();
        sizeProp = this.getSizeProp();
        return boundingClientRect[sizeProp];
    },
    handleResizeStart: function (divider, zones, evt) {
        var collapsedZoneSize, resizeRatio, positionProp, zoneSize;
        
        getZoneSize = this.getZoneSize.bind(this);
        positionProp = this.getPositionProp();
        
        collapsedZone = (zones[0].isCollapsed && zones[0]) || (zones[1].isCollapsed && zones[1]);
        
        if (collapsedZone) {
            collapsedZoneSize = this.getZoneSize(zones[0]);
            collapsedZone.expand();
            zoneSize = this.getZoneSize(zones[0]);
            resizeRatio = (collapsedZoneSize - zoneSize) / zoneSize;
        }
        
        this.isResizing = true;
        this.resizingZones = zones;
        this.resizingDivider = divider;
        this.resizePosition = evt[positionProp];
        if (resizeRatio) {
            this.resize(resizeRatio, zones[0], zones[1]);
        }
    },
    handleResizeEnd: function (evt) {
        this.isResizing = false;
        this.resizingZones = [];
        delete this.resizingDivider;
        this.resizePosition = 0;
    },
    handleResizeMove: function (evt) {
        var positionProp, resizeRatio;
        positionProp = this.getPositionProp();
        if (this.isResizing) {
            if (evt.buttons > 0) {
                resizeRatio = this.getZoneRatio(evt[positionProp] - this.resizePosition, this.resizingZones[0]);
                this.resizingDivider.setCollapsed(false);
                this.resize(resizeRatio, this.resizingZones[0], this.resizingZones[1]);
                this.resizePosition = evt[positionProp];
            } else {
                this.handleResizeEnd(evt);
            }
        }
        evt.preventDefault();
    },
    removeDivider: function (zones) {
        var divider = this.getDivider(zones);
        if (divider) {
            this.dividers.splice(this.dividers.indexOf(divider), 1);
            this.element.removeChild(divider.element);            
        }
        return this;
    },
    removeZone: function (zone) {
        var index;
        if ('number' === typeof parseInt(zone, 10)) {
            index = zone;
            zone = this.zones[zone];
        } else {
            index = this.zones.indexOf(zone);
        }

        this.removeDivider(this.zones.slice(index - 1, index + 1));
        this.removeDivider(this.zones.slice(index, index + 2));
        
        this.element.removeChild(zone.element);
        this.zones.splice(index, 1);
        
        this.addDivider(this.zones.slice(index - 1, index + 1));
        this.addDivider(this.zones.slice(index, index + 2));

        return zone;
    },
    resize: function (resizeRatio, firstZone, secondZone) {
        var firstFlex, secondFlex, totalFlex;
        
        firstFlex = parseFloat(firstZone.element.style.flexGrow || 1, 10);
        secondFlex = parseFloat(secondZone.element.style.flexGrow || 1, 10);
        totalFlex = firstFlex + secondFlex;

        firstFlex += firstFlex * resizeRatio;
        secondFlex = totalFlex - firstFlex;
                
        firstZone.resize(firstFlex);
        secondZone.resize(secondFlex);
        return this;
    },
    updateAddresses: function (home) {
        this.zones.forEach(function (zone, i) {
            var local = (home ? `${home}.${i}` : `${i}`);
            if (zone.childGroup) {
                zone.childGroup.updateAddresses(local);
            } else {
                zone.address = local;
                zone.identifier.textContent = local;
                zone.identifier.appendChild(zone.removeZoneButton);
            }
        });
        return this;
    }
};

function LayoutDivider (config) {
    var directions = ['backward', 'forward'];

    config = config || {};
    
    this.isResizeAllowed = config.allowResize;
    this.parent = config.parent;
    this.resizeListeners = [];
    this.zones = config.zones;
    
    this.element = document.createElement('div');
    this.element.className = 'layout-manager--divider';

    if (this.isResizeAllowed) {
        this.element.className += ' is-allowed-resize';
        
        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'layout-manager--divider--resizeHandle';
        
        this.collapseForwardButton = document.createElement('button');
        this.collapseForwardButton.className = 'layout-manager--divider--collapse-button forward';
        this.collapseForwardButton.textContent = '>';
        this.collapseForwardButton.addEventListener('click', this.handleButtonClick.bind(this, 'forward'));

        this.collapseBackwardButton = document.createElement('button');
        this.collapseBackwardButton.className = 'layout-manager--divider--collapse-button backward';
        this.collapseBackwardButton.textContent = '<';
        this.collapseBackwardButton.addEventListener('click', this.handleButtonClick.bind(this, 'backward'));

        this.element.appendChild(this.resizeHandle);
        this.element.appendChild(this.collapseForwardButton);
        this.element.appendChild(this.collapseBackwardButton);

        this.resizeHandle.addEventListener('mousedown', this.handleResizeStart.bind(this));
        this.zones.forEach(function (zone, i) {
            zone.element.addEventListener('zone-collapse', this.handleZoneCollapse.bind(this, directions[i]));
            zone.element.addEventListener('zone-expand', this.handleZoneExpand.bind(this, directions[i]));
        }.bind(this));
    }

    if (this.parent) {
        this.parent.element.insertBefore(this.element, this.zones[1].element);
    }    
}

LayoutDivider.prototype = {
    clearCollapsedClass: function () {
        this.element.className = this.element.className.replace(/\s*is\-collapsed-(?:for|back)ward\s*/g, '');
    },
    destroy: function () {
        this.parent.removeChild(this.element);
    },
    handleButtonClick: function (direction, evt) {
        if (this.collapsedDirection) {
            this.handleExpandClick(evt);
        }
        this.handleCollapseClick(direction, evt);
    },
    handleCollapseClick: function (direction, evt) {
        var zone = ('forward' === direction ? this.zones[1] : this.zones[0]);
        zone.collapse();
        this.setCollapsed(direction);
        evt.stopPropagation();
    },
    handleExpandClick: function (evt) {
        var zone = ('forward' === this.collapsedDirection ? this.zones[1] : this.zones[0]);
        zone.expand();
        this.setCollapsed(false);
        evt.stopPropagation();
    },
    handleResizeStart: function (evt) {
        this.resizeListeners.forEach(function (listener) {
            listener.handler(evt);
        });
    },
    handleZoneCollapse: function (direction, evt) {
        if (!this.collapsedDirection) {
            this.setCollapsed(direction);
        }
    },
    handleZoneExpand: function (direction, evt) {
        if (direction === this.collapsedDirection) {
            this.setCollapsed(false);
        }
    },
    registerResizeStartListener: function (scope, callback) {
        if (this.isResizeAllowed) {
            this.resizeListeners.push({
                scope: scope,
                handler: callback.bind(scope, this, this.zones.slice(0))
            });
        }
    },
    setCollapsed: function (direction) {
        this.clearCollapsedClass();
        this.collapsedDirection = direction;
        if (direction) {
            this.element.className += ' is-collapsed-' + direction;
        }
    }
};

function LayoutZoneEvent (eventName, zone) {
    var boundingClientRect, validEventNames;
    validEventNames = ['zone-collapse', 'zone-expand', 'zone-resize'];

    if (-1 === validEventNames.indexOf(eventName)) {
        throw 'LayoutZoneEvent received invalid eventName: ' + eventName;
    }
    
    if (!zone || !zone.element) {
        throw 'LayoutZoneEvent received an invalid LayoutZone object: ' + zone;
    }

    boundingClientRect = zone.element.getBoundingClientRect();

    return new CustomEvent(eventName, {
        bubbles: false,
        cancelable: true,
        detail: {
            address: zone.address,
            height: boundingClientRect.height,
            width: boundingClientRect.width
        }
    });
}

function LayoutZone (config) {
    config = config || {};
    this.address = config.address;
    this.childGroup = null;
    this.isCollapsed = !!config.isCollapsed;
    this.minSize = isNaN(config.minSize) ? 50 : config.minSize;
    this.size = isNaN(config.size) ? 1 : config.size;

    this.identifier = document.createElement('div');
    this.identifier.className = 'layout-manager--zone-identifier';
    this.identifier.textContent = this.address;

    this.removeZoneButton = document.createElement('button');
    this.removeZoneButton.className = 'remove-zone-button';
    this.removeZoneButton.textContent = 'Close Zone';
    this.identifier.appendChild(this.removeZoneButton);
    
    if (config.element) {
        this.element = config.element;
    } else {
        this.element = document.createElement('div');
        this.element.appendChild(makeDummyContent());
    }
    this.element.className = 'layout-manager--zone';
    this.element.appendChild(this.identifier);
    
    this.removeZoneButton.addEventListener('click', function (evt) {
        evt.target.setAttribute('data-address', this.address);
    }.bind(this));
    
    if (config.parent) {
        this.attachTo(config.parent);
    }
}

LayoutZone.prototype = {
    attachTo: LayoutController.prototype.attachTo,
    addGroup: function (config) {
        var newGroup, newZoneElement, oldZoneElement, oldZoneStyle;
        config = config || {};
        if (!this.childGroup) {
            // TODO: This should be cleaned up to do more generic DOM manipulation and leverage cloneNode()
            // Save a reference to the current zone's element
            oldZoneElement = this.element;
            this.element.removeChild(this.identifier);

            // Replace this zone element with a group container
            newZoneElement = document.createElement('div');
            newZoneElement.className = 'layout-manager--zone has-child-group';
            newZoneElement.setAttribute('style', oldZoneElement.getAttribute('style'));
            oldZoneElement.removeAttribute('style');
            oldZoneElement.parentElement.replaceChild(newZoneElement, oldZoneElement);
            this.element = newZoneElement;
            
            // Create the new layout group
            config.parent = newZoneElement;
            newGroup = new LayoutGroup(config);
            this.childGroup = newGroup;
            
            // Attach the new group to the new zone element and reattach the old zone there
            newGroup.addZone({element: oldZoneElement});
        }
        return newGroup;
    },
    clearCollapsedClass: function () {
        this.element.className = this.element.className.replace(/\s*is\-collapsed\s*/g, '');
    },
    collapse: function () {
        this.isCollapsed = true;
        this.element.style.flexGrow = 0.00001;
        this.clearCollapsedClass();
        this.element.className += ' is-collapsed';
        this.trigger('zone-collapse');
        return this;
    },
    configure: function (config) {
        this.minSize = isNaN(config.minSize) ? 50 : config.minSize;

        if (config.size) {
            this.resize(config.size);
        }

        if (config.isCollapsed) {
            this.collapse();
        } else {
            this.expand();
        }
    },
    destroy: function () {
        this.parent.removeChild(this.element);
        delete this.parent;
        delete this.childGrouup;
    },
    expand: function () {
        this.resize(this.size);
        this.trigger('zone-expand');
        return this;
    },
    resize: function (size) {
        this.isCollapsed = false;
        this.clearCollapsedClass();
        this.size = size;
        this.element.style.flexGrow = size;
        return this;
    },
    trigger: function (eventName) {
        this.element.dispatchEvent(new LayoutZoneEvent(eventName, this));
    }
};

layout = new LayoutController({parent: root});

saveLayoutButton.addEventListener('click', function (evt) {
    savedLayout = layout.getLayoutMap();
});

restoreLayoutButton.addEventListener('click', function (evt) {
    layout.restore(savedLayout);
});

addZoneButton.addEventListener('click', function (evt) {
    var layoutPicker;
    
    function createNextAddress (address) {
        var nextIndex, path;
        
        path = address.split('.');
        nextIndex = parseInt(path.pop(), 10) + 1;
        path.push(nextIndex);
        return path.join('.');
    }
    
    function transformLayoutMap(parentGroup, zone, i) {
        var groupTargetAfter, groupTargetBefore, oppositeDirection, zonePlaceholder, zoneTargetAfter, zoneTargetBefore;
        
        parentGroup = parentGroup || {zones: []};
        oppositeDirection = ('row' === parentGroup.direction ? 'column' : 'row');
        
        groupTargetBefore = document.createElement('div');
        groupTargetBefore.className = 'new-group-target';
        
        groupTargetAfter = document.createElement('div');
        groupTargetAfter.className = 'new-group-target';
        
        zonePlaceholder = document.createElement('div');
        zonePlaceholder.className = 'zone-content-placeholder';
        
        zoneTargetBefore = document.createElement('div');
        zoneTargetBefore.className = 'new-zone-target';
        
        zoneTargetAfter = document.createElement('div');
        zoneTargetAfter.className = 'new-zone-target';
        
        if (zone.childGroup) {
            zone.childGroup.zones.map(transformLayoutMap.bind(this, zone.childGroup));
        } else {
            zone.element.innerHTML = '';
            zone.element.style.flexDirection = oppositeDirection;
            
            groupTargetBefore.setAttribute('data-address', zone.address + '.0');
            groupTargetBefore.setAttribute('data-direction', oppositeDirection);
            zone.element.appendChild(groupTargetBefore);
            zone.element.appendChild(zonePlaceholder);
            groupTargetAfter.setAttribute('data-direction', oppositeDirection);
            groupTargetAfter.setAttribute('data-address', zone.address + '.1');
            zone.element.appendChild(groupTargetAfter);
        }
        if ('0' !== zone.address) {
            zoneTargetBefore.setAttribute('data-address', zone.address);
            zone.parent.insertBefore(zoneTargetBefore, zone.element);
        }
        if (i === parentGroup.zones.length - 1) {
            zoneTargetAfter.setAttribute('data-address', createNextAddress(zone.address));
            zone.parent.appendChild(zoneTargetAfter);
        }
    }
        
    layoutPicker = new LayoutController({
        allowResize: false,
        layoutMap: layout.getLayoutMap(),
        parent: document.body
    });
    
    layoutPicker.element.className += ' is-editing-mode';
    layoutPicker.element.style.left = 'auto';
    layoutPicker.element.style.right = document.body.offsetWidth - addZoneButton.offsetWidth - addZoneButton.offsetLeft + 'px';
    layoutPicker.element.style.top = 10 + addZoneButton.offsetTop + addZoneButton.offsetHeight + 'px';
    
    transformLayoutMap(null, layoutPicker.rootZone);
    layoutPicker.element.style.flexDirection = ('row' === (layoutPicker.rootZone.childGroup && layoutPicker.rootZone.childGroup.direction) ? 'column' : 'row');
    
    layoutPicker.element.addEventListener('click', function (evt) {
        var address, direction, groupAddress, target;
        target = evt.target;
        direction = target.getAttribute('data-direction');
        address = target.getAttribute('data-address');
        
        layoutPicker.parent.removeChild(layoutPicker.element);
        
        if (address) {
            if (direction) {
                groupAddress = address.split('.').slice(0, -1).join('.');
                layout.addGroup(groupAddress, {direction: direction});
                if (/^0\.[01]$/.test(address)) {
                    address = '0.' + address;
                }
                layout.addZone(address);
                console.log(`created new ${direction} group with new zone ${address}`);
            } else {
                layout.addZone(address);
                console.log(`created new zone at ${address}`);
            }
        }
    });
});

/*
layout.restore({"address":"0","isCollapsed":false,"minSize":50,"size":1,"type":"group","direction":"row","zones":[{"address":"0.0","isCollapsed":false,"minSize":50,"size":0.3,"type":"zone"},{"address":"0.1","isCollapsed":false,"minSize":50,"size":1,"type":"zone"},{"address":"0.2","isCollapsed":false,"minSize":50,"size":1,"type":"group","direction":"column","zones":[{"address":"0.2.0","isCollapsed":false,"minSize":50,"size":1,"type":"zone"},{"address":"0.2.1","isCollapsed":false,"minSize":50,"size":1,"type":"zone"}]}],"isRoot":true});
*/