// CleanFlow 3D Washing Machine Visualizer using Three.js

class LaundryWasher {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error("3D Container not found");
            return;
        }

        // State variables
        this.isPowered = false;
        this.isDoorOpen = false;
        this.isDrawerOpen = false;
        this.soapLevel = 0; // 0 to 100
        this.currentPhase = 'idle'; // idle, filling, washing, rinsing, spinning, completed
        
        this.rpm = 0;
        this.targetRpm = 0;
        this.drumAngle = 0;
        
        this.waterLevel = 0; // 0 to 1
        this.targetWaterLevel = 0;
        this.bubbleCount = 0;
        this.maxBubbles = 100;
        
        // Physics for clothes
        this.clothes = [];
        this.bubbles = [];

        // Initialize 3D Scene
        this.initScene();
        this.buildEnvironment();
        this.buildWashingMachine();
        this.initClothes();
        this.initBubbles();
        this.initLights();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Start animation loop
        this.clock = new THREE.Clock();
        this.animate();
    }

    initScene() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x070a13);
        // Fog for depth
        this.scene.fog = new THREE.FogExp2(0x070a13, 0.05);

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        this.camera.position.set(0, 1.2, 5.5);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        
        this.container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 3;
        this.controls.maxDistance = 10;
        this.controls.minPolarAngle = 0.2; // don't look completely from top
        this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // don't look from floor
        this.controls.target.set(0, 0.2, 0);
    }

    initLights() {
        // Ambient Light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // Key Light (Front Right)
        const keyLight = new THREE.DirectionalLight(0xe0f2fe, 1.2);
        keyLight.position.set(5, 5, 4);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        keyLight.shadow.bias = -0.001;
        this.scene.add(keyLight);

        // Fill Light (Front Left)
        const fillLight = new THREE.DirectionalLight(0x312e81, 0.6); // deep blue fill
        fillLight.position.set(-5, 3, 2);
        this.scene.add(fillLight);

        // Back Rim Light (For glowing outline)
        const rimLight = new THREE.DirectionalLight(0x22d3ee, 1.5); // Cyan rim light
        rimLight.position.set(0, 4, -4);
        this.scene.add(rimLight);

        // Internal Drum Light (Point Light inside washer)
        this.drumLight = new THREE.PointLight(0x22d3ee, 0, 3); // starts off
        this.drumLight.position.set(0, 0.3, 0.2);
        this.scene.add(this.drumLight);
    }

    buildEnvironment() {
        // Floor
        const floorGeo = new THREE.PlaneGeometry(20, 20);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x111827,
            roughness: 0.8,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.5;
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Back Wall
        const wallGeo = new THREE.PlaneGeometry(20, 10);
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            roughness: 0.9,
            metalness: 0.1
        });
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(0, 3.5, -4);
        wall.receiveShadow = true;
        this.scene.add(wall);
    }

    buildWashingMachine() {
        this.washerGroup = new THREE.Group();
        this.scene.add(this.washerGroup);

        // 1. Chassis Outer Body
        const chassisGeo = new THREE.BoxGeometry(2.4, 2.8, 2.2);
        const chassisMat = new THREE.MeshStandardMaterial({
            color: 0xf1f5f9, // clean light slate
            roughness: 0.4,
            metalness: 0.3
        });
        const chassis = new THREE.Mesh(chassisGeo, chassisMat);
        chassis.position.y = -0.1;
        chassis.castShadow = true;
        chassis.receiveShadow = true;
        this.washerGroup.add(chassis);

        // 2. Control Panel Face
        const panelGeo = new THREE.BoxGeometry(2.4, 0.5, 0.05);
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a, // dark slate panel
            roughness: 0.1,
            metalness: 0.8
        });
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(0, 1.05, 1.1);
        this.washerGroup.add(panel);

        // 3. Detergent Drawer (Slides out)
        this.drawerGroup = new THREE.Group();
        this.drawerGroup.position.set(-0.6, 1.05, 1.1);
        this.washerGroup.add(this.drawerGroup);

        const drawerFrontGeo = new THREE.BoxGeometry(0.7, 0.4, 0.04);
        const drawerFrontMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            roughness: 0.4,
            metalness: 0.3
        });
        const drawerFront = new THREE.Mesh(drawerFrontGeo, drawerFrontMat);
        this.drawerGroup.add(drawerFront);

        // Drawer inner cup (hidden inside washer, slides out)
        const drawerCupGeo = new THREE.BoxGeometry(0.5, 0.1, 0.8);
        const drawerCupMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.9
        });
        const drawerCup = new THREE.Mesh(drawerCupGeo, drawerCupMat);
        drawerCup.position.set(0, -0.1, -0.4);
        this.drawerGroup.add(drawerCup);

        // Soap Liquid shape inside drawer (height animates on soap level)
        const soapLiquidGeo = new THREE.BoxGeometry(0.48, 0.06, 0.7);
        this.soapLiquidMat = new THREE.MeshStandardMaterial({
            color: 0x22d3ee, // blue soapy soap
            roughness: 0.1,
            transparent: true,
            opacity: 0.8
        });
        this.soapLiquidMesh = new THREE.Mesh(soapLiquidGeo, this.soapLiquidMat);
        this.soapLiquidMesh.position.set(0, -0.06, -0.4);
        this.soapLiquidMesh.scale.y = 0.001; // hide initially
        this.drawerGroup.add(this.soapLiquidMesh);

        // 4. Drum Front Cave (Circular dark area where drum sits)
        const caveGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.1, 32);
        const caveMat = new THREE.MeshStandardMaterial({
            color: 0x090d16, // very dark inner ring
            roughness: 0.9
        });
        const cave = new THREE.Mesh(caveGeo, caveMat);
        cave.rotation.x = Math.PI / 2;
        cave.position.set(0, -0.1, 1.06);
        this.washerGroup.add(cave);

        // 5. INNER ROTATING DRUM
        this.drumGroup = new THREE.Group();
        this.drumGroup.position.set(0, -0.1, 0.1);
        this.washerGroup.add(this.drumGroup);

        // Metallic cylinder
        const drumGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.4, 24, 1, true);
        const drumMat = new THREE.MeshStandardMaterial({
            color: 0xd1d5db, // metal grey
            roughness: 0.2,
            metalness: 0.9,
            side: THREE.DoubleSide
        });
        const drumCylinder = new THREE.Mesh(drumGeo, drumMat);
        drumCylinder.rotation.x = Math.PI / 2;
        drumCylinder.position.z = 0.4;
        this.drumGroup.add(drumCylinder);

        // Drum Back Plate
        const drumBackGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.05, 24);
        const drumBack = new THREE.Mesh(drumBackGeo, drumMat);
        drumBack.rotation.x = Math.PI / 2;
        drumBack.position.z = -0.3;
        this.drumGroup.add(drumBack);

        // Inner Agitators / Paddles (3 blocks inside the cylinder to push clothes)
        const paddleGeo = new THREE.BoxGeometry(0.12, 0.15, 1.3);
        const paddleMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3, metalness: 0.7 });
        this.paddles = [];
        for (let i = 0; i < 3; i++) {
            const paddle = new THREE.Mesh(paddleGeo, paddleMat);
            const angle = (i * Math.PI * 2) / 3;
            // Place on cylinder inner walls
            paddle.position.set(Math.cos(angle) * 0.72, Math.sin(angle) * 0.72, 0.4);
            paddle.rotation.z = angle;
            this.drumGroup.add(paddle);
        }

        // 6. DOOR HINGE & DOOR ASSEMBLY
        // Create pivot group at the left side of door frame
        this.doorHinge = new THREE.Group();
        this.doorHinge.position.set(-0.85, -0.1, 1.1); // pivot point on chassis front-left
        this.washerGroup.add(this.doorHinge);

        // Group to hold door parts (offset relative to hinge pivot)
        this.doorGroup = new THREE.Group();
        this.doorGroup.position.set(0.85, 0, 0.02); // place door centered in front of hole
        this.doorHinge.add(this.doorGroup);

        // Door Chrome Bezel Ring
        const doorRingGeo = new THREE.TorusGeometry(0.82, 0.09, 16, 48);
        const chromeMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            roughness: 0.1,
            metalness: 0.95
        });
        const doorBezel = new THREE.Mesh(doorRingGeo, chromeMat);
        doorBezel.castShadow = true;
        this.doorGroup.add(doorBezel);

        // Door Glass (concave-ish look or flat translucent cylinder)
        const glassGeo = new THREE.CylinderGeometry(0.74, 0.74, 0.06, 32);
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x93c5fd, // translucent sky blue
            transparent: true,
            opacity: 0.35,
            roughness: 0.05,
            metalness: 0.1
        });
        const doorGlass = new THREE.Mesh(glassGeo, glassMat);
        doorGlass.rotation.x = Math.PI / 2;
        this.doorGroup.add(doorGlass);

        // Door Handle (small chrome block on the right side)
        const handleGeo = new THREE.BoxGeometry(0.08, 0.25, 0.08);
        const doorHandle = new THREE.Mesh(handleGeo, chromeMat);
        doorHandle.position.set(0.82, 0, 0.04);
        this.doorGroup.add(doorHandle);

        // 7. WATER INSIDE THE DRUM
        // Water is represented by a semi-transparent cylinder inside the drum. It does not rotate with the drum.
        const waterGeo = new THREE.CylinderGeometry(0.76, 0.76, 1.35, 32, 1);
        this.waterMat = new THREE.MeshStandardMaterial({
            color: 0x06b6d4, // Cyan translucent
            transparent: true,
            opacity: 0.45,
            roughness: 0.1,
            metalness: 0.1
        });
        this.waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
        this.waterMesh.rotation.x = Math.PI / 2;
        this.waterMesh.position.set(0, -0.1, 0.5); // centered inside drum, slightly forward
        this.waterMesh.scale.set(0.001, 1, 0.001); // starts flat/empty
        this.washerGroup.add(this.waterMesh);
    }

    initClothes() {
        // Create clothing items inside the drum
        const colors = [0xf87171, 0xfef08a, 0x38bdf8, 0x4ade80, 0xa78bfa]; // red, yellow, blue, green, purple
        const shapes = [
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.DodecahedronGeometry(0.2, 0),
            new THREE.IcosahedronGeometry(0.2, 1)
        ];

        this.clothes = [];

        for (let i = 0; i < 4; i++) {
            const geo = shapes[i % shapes.length].clone();
            
            // Randomly deform vertex positions to make it look like fabric bundle
            const pos = geo.attributes.position;
            for (let j = 0; j < pos.count; j++) {
                const vx = pos.getX(j);
                const vy = pos.getY(j);
                const vz = pos.getZ(j);
                pos.setX(j, vx + (Math.random() - 0.5) * 0.06);
                pos.setY(j, vy + (Math.random() - 0.5) * 0.06);
                pos.setZ(j, vz + (Math.random() - 0.5) * 0.06);
            }
            geo.computeVertexNormals();

            const mat = new THREE.MeshStandardMaterial({
                color: colors[i % colors.length],
                roughness: 0.9, // flat fabric look
                metalness: 0.0
            });

            const mesh = new THREE.Mesh(geo, mat);
            
            // Local physical properties for tumbling simulation
            this.clothes.push({
                mesh: mesh,
                angle: (i * Math.PI * 2) / 4, // initial local position angle on drum wall
                radius: 0.45 + Math.random() * 0.1,
                zOffset: 0.1 + (i * 0.2), // stack along depth of drum
                velAngle: 0,
                isFreeFalling: false,
                fallTimer: 0,
                fallX: 0,
                fallY: 0,
                fallVelX: 0,
                fallVelY: 0
            });

            this.drumGroup.add(mesh);
        }
    }

    initBubbles() {
        this.bubblesGroup = new THREE.Group();
        this.bubblesGroup.position.set(0, -0.1, 0.5); // inside drum
        this.washerGroup.add(this.bubblesGroup);

        const bubbleGeo = new THREE.SphereGeometry(0.06, 8, 8);
        const bubbleMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.65,
            roughness: 0.02,
            metalness: 0.3
        });

        this.bubbles = [];

        for (let i = 0; i < this.maxBubbles; i++) {
            const mesh = new THREE.Mesh(bubbleGeo, bubbleMat);
            // Hide initially by setting scale to 0
            mesh.scale.set(0.001, 0.001, 0.001);
            this.bubblesGroup.add(mesh);

            this.bubbles.push({
                mesh: mesh,
                x: 0,
                y: -0.6,
                z: (Math.random() - 0.5) * 1.0,
                speedX: (Math.random() - 0.5) * 0.2,
                speedY: 0.2 + Math.random() * 0.4,
                wobbleSpeed: 2 + Math.random() * 5,
                wobbleAmp: 0.02 + Math.random() * 0.04,
                wobbleOffset: Math.random() * Math.PI * 2,
                scale: 0.3 + Math.random() * 0.8,
                isActive: false
            });
        }
    }

    // STATE API MUTATORS
    setPower(powerState) {
        this.isPowered = powerState;
        if (powerState) {
            // Power ON: soft cyan glow inside drum
            this.drumLight.intensity = 1.0;
            this.drumLight.color.setHex(0x22d3ee);
        } else {
            // Power OFF: stop spinning, drain water, turn off light, close drawer
            this.drumLight.intensity = 0;
            this.targetRpm = 0;
            this.targetWaterLevel = 0;
            this.setPhase('idle');
            this.openDoor(false);
            this.openDrawer(false);
        }
    }

    openDoor(openState) {
        if (!this.isPowered && openState) return; // ignore if off
        if (this.currentPhase !== 'idle' && this.currentPhase !== 'completed' && openState) {
            return; // cannot open door while washing/spinning!
        }
        this.isDoorOpen = openState;
    }

    openDrawer(openState) {
        if (!this.isPowered && openState) return;
        this.isDrawerOpen = openState;
    }

    setSoapLevel(level) {
        this.soapLevel = Math.max(0, Math.min(100, level));
        // Update liquid scale in drawer
        if (this.soapLiquidMesh) {
            this.soapLiquidMesh.scale.y = Math.max(0.001, this.soapLevel / 100);
        }
    }

    setPhase(phase) {
        this.currentPhase = phase;
        
        switch (phase) {
            case 'idle':
                this.targetRpm = 0;
                this.targetWaterLevel = 0;
                this.drumLight.color.setHex(0x22d3ee);
                break;
            case 'filling':
                this.targetRpm = 15; // slow jiggles
                this.targetWaterLevel = 0.55;
                this.drumLight.color.setHex(0x06b6d4); // darker blue
                break;
            case 'washing':
                this.targetRpm = 45; // standard tumble
                this.targetWaterLevel = 0.50;
                this.drumLight.color.setHex(0x38bdf8); // sky blue
                break;
            case 'rinsing':
                this.targetRpm = 40;
                this.targetWaterLevel = 0.60;
                this.drumLight.color.setHex(0xa78bfa); // purple rinse
                break;
            case 'spinning':
                this.targetRpm = 800; // super fast spin dry
                this.targetWaterLevel = 0; // water drained
                this.drumLight.color.setHex(0xf472b6); // pinkish glow
                break;
            case 'completed':
                this.targetRpm = 0;
                this.targetWaterLevel = 0;
                this.drumLight.color.setHex(0x34d399); // green glow
                break;
        }
    }

    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    // ANIMATION & PHYSICS TICK
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = this.clock.getDelta();
        
        // 1. Update controls
        if (this.controls) this.controls.update();

        // 2. Smoothly rotate door hinge to target
        const targetDoorAngle = this.isDoorOpen ? -Math.PI / 2 : 0;
        this.doorHinge.rotation.y = THREE.MathUtils.lerp(this.doorHinge.rotation.y, targetDoorAngle, 0.08);

        // 3. Smoothly slide soap drawer to target
        const targetDrawerPos = this.isDrawerOpen ? 1.5 : 1.1; // slide in z-axis
        this.drawerGroup.position.z = THREE.MathUtils.lerp(this.drawerGroup.position.z, targetDrawerPos, 0.08);

        // 4. Handle RPM smoothing and Drum Rotation
        this.rpm = THREE.MathUtils.lerp(this.rpm, this.targetRpm, 0.03);
        if (this.isPowered) {
            // Washing cycle involves reversing direction every few seconds
            let currentRpmDirection = 1;
            if (this.currentPhase === 'washing' || this.currentPhase === 'rinsing') {
                // Reverse direction every 5 seconds
                const timeSec = this.clock.getElapsedTime();
                currentRpmDirection = Math.sin(timeSec * Math.PI * 0.4) > 0 ? 1 : -1;
            }
            
            // Update drum rotation angle
            // 1 RPM = 1 turn per minute = 2*PI / 60 radians per second
            const radSpeed = (this.rpm * (2 * Math.PI) / 60) * currentRpmDirection;
            this.drumAngle += radSpeed * delta;
            this.drumGroup.rotation.z = this.drumAngle;
        }

        // 5. Water Fill Animation & Splashing Waves
        this.waterLevel = THREE.MathUtils.lerp(this.waterLevel, this.targetWaterLevel, 0.04);
        if (this.waterLevel > 0.01) {
            // Scale cylinder up on X/Y (since rotated, X and Z are radius, Y is length. In our geometry x=0.76, y=1.35)
            // Scale X/Y representing radius, Z represents depth
            this.waterMesh.scale.x = 1;
            this.waterMesh.scale.y = 1;
            // Height level of water is simulated by moving water plane or scaling cylinder's position.
            // A simple scale: scale on local cylinder axis Y (along cylinder depth) and Z (water depth)
            // Let's scale local Y (radius) based on fill level
            const heightFactor = this.waterLevel;
            this.waterMesh.scale.set(heightFactor, 1, heightFactor);
            // Translate water down so it sits at the bottom of the drum
            this.waterMesh.position.y = -0.1 - (1.0 - heightFactor) * 0.35;
            
            // splashing wavy motion
            if (this.currentPhase === 'washing' || this.currentPhase === 'rinsing') {
                const splashTime = this.clock.getElapsedTime() * 15;
                this.waterMesh.position.y += Math.sin(splashTime) * 0.015;
                this.waterMesh.position.x += Math.cos(splashTime * 0.8) * 0.01;
            }
        } else {
            this.waterMesh.scale.set(0.001, 1, 0.001);
        }

        // 6. Physics Simulation of Clothes Tumbling
        this.updateClothesPhysics(delta);

        // 7. Bubble Particle System update
        this.updateBubblesPhysics(delta);

        // Render scene
        this.renderer.render(this.scene, this.camera);
    }

    updateClothesPhysics(delta) {
        const radAngle = this.drumAngle; // current drum angle in radians
        
        // Centrifugal threshold: if drum spins fast enough, clothes stick to the wall!
        // At 800 RPM (spinning phase), clothes are stuck.
        const isCentrifugalStuck = this.rpm > 350;

        this.clothes.forEach((cloth) => {
            if (!this.isPowered) {
                // gravity drops clothes to bottom
                cloth.mesh.position.x = THREE.MathUtils.lerp(cloth.mesh.position.x, 0, 0.1);
                cloth.mesh.position.y = THREE.MathUtils.lerp(cloth.mesh.position.y, -0.5, 0.1);
                cloth.mesh.position.z = THREE.MathUtils.lerp(cloth.mesh.position.z, cloth.zOffset, 0.1);
                cloth.mesh.rotation.z += (0 - cloth.mesh.rotation.z) * 0.1;
                return;
            }

            if (isCentrifugalStuck) {
                // stuck to drum wall, rotating in lockstep
                const combinedAngle = cloth.angle + radAngle;
                cloth.mesh.position.x = Math.cos(combinedAngle) * cloth.radius;
                cloth.mesh.position.y = Math.sin(combinedAngle) * cloth.radius;
                cloth.mesh.position.z = cloth.zOffset;
                cloth.mesh.rotation.z = combinedAngle;
                cloth.isFreeFalling = false;
                return;
            }

            if (cloth.isFreeFalling) {
                // Free fall gravity physics
                cloth.fallTimer += delta;
                cloth.fallX += cloth.fallVelX * delta;
                // standard gravity formula: dy = vt - 0.5*g*t^2
                cloth.fallVelY -= 9.8 * delta;
                cloth.fallY += cloth.fallVelY * delta;

                cloth.mesh.position.x = cloth.fallX;
                cloth.mesh.position.y = cloth.fallY;
                cloth.mesh.rotation.z += 5 * delta; // tumble spin

                // Collision with drum bottom boundary
                const distFromCenter = Math.sqrt(cloth.fallX * cloth.fallX + cloth.fallY * cloth.fallY);
                if (distFromCenter >= cloth.radius - 0.15 || cloth.fallY <= -0.55) {
                    cloth.isFreeFalling = false;
                    // determine new attachment angle on bottom drum wall
                    cloth.angle = Math.atan2(cloth.fallY, cloth.fallX) - radAngle;
                }
            } else {
                // Carried up by drum rotation
                const combinedAngle = cloth.angle + radAngle;
                const cosVal = Math.cos(combinedAngle);
                const sinVal = Math.sin(combinedAngle);
                
                // Set position based on drum angle
                cloth.mesh.position.x = cosVal * cloth.radius;
                cloth.mesh.position.y = sinVal * cloth.radius;
                cloth.mesh.position.z = cloth.zOffset;
                cloth.mesh.rotation.z = combinedAngle;

                // Slip / drop threshold:
                // If spinning forward (positive RPM), slip at top-right side (e.g. angle around 60 to 110 degrees)
                // If spinning backward (negative RPM), slip at top-left side
                // Slip angles: let's calculate actual height and lift angle
                const drumSpeedRad = (this.rpm * (2 * Math.PI) / 60);
                const angleMod = ((combinedAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2); // normalize 0 to 2PI
                
                // Slip if we are high up in the drum:
                // e.g. angle in y > 0 range (above center)
                let shouldSlip = false;
                if (drumSpeedRad > 10) {
                    // faster tumbles slip higher
                    shouldSlip = (angleMod > Math.PI * 0.65 && angleMod < Math.PI * 1.35); 
                } else {
                    shouldSlip = (angleMod > Math.PI * 0.45 && angleMod < Math.PI * 1.55);
                }

                if (shouldSlip && Math.random() < 0.25) {
                    // detach and enter free fall
                    cloth.isFreeFalling = true;
                    cloth.fallTimer = 0;
                    cloth.fallX = cloth.mesh.position.x;
                    cloth.fallY = cloth.mesh.position.y;
                    
                    // tangential velocity: v = w * r
                    const w = radAngle > 0 ? (this.rpm * 2 * Math.PI / 60) : -(this.rpm * 2 * Math.PI / 60);
                    // velocity vector perpendicular to radius
                    cloth.fallVelX = -sinVal * w * cloth.radius * 0.35; // slow down velocity inside drum
                    cloth.fallVelY = cosVal * w * cloth.radius * 0.35;
                }
            }
        });
    }

    updateBubblesPhysics(delta) {
        // Target bubble count based on soap level & wash phases (washing/rinsing generates bubbles, spin/idle drains them)
        let activeMax = 0;
        if (this.isPowered && this.soapLevel > 0) {
            if (this.currentPhase === 'washing') {
                activeMax = Math.floor((this.soapLevel / 100) * this.maxBubbles);
            } else if (this.currentPhase === 'rinsing') {
                activeMax = Math.floor((this.soapLevel / 100) * this.maxBubbles * 0.3); // fewer bubbles in rinse
            }
        }

        const elapsed = this.clock.getElapsedTime();

        this.bubbles.forEach((b, index) => {
            // Activate new bubble if needed
            if (!b.isActive && index < activeMax && Math.random() < 0.05) {
                b.isActive = true;
                b.x = (Math.random() - 0.5) * 0.8;
                b.y = -0.55; // start bottom
                b.z = (Math.random() - 0.5) * 0.9;
                b.scale = 0.3 + Math.random() * 0.8;
                b.mesh.scale.set(b.scale, b.scale, b.scale);
            }

            if (b.isActive) {
                // Rising motion + jiggle/wobble
                b.y += b.speedY * delta;
                
                // horizontal wobble
                const wobble = Math.sin(elapsed * b.wobbleSpeed + b.wobbleOffset) * b.wobbleAmp;
                b.x += b.speedX * delta + wobble;
                
                // Rotational movement if drum is spinning
                if (this.rpm > 10) {
                    const rotSpeed = (this.rpm * 2 * Math.PI / 60) * 0.2; // swirl slower than drum
                    const cosA = Math.cos(rotSpeed * delta);
                    const sinA = Math.sin(rotSpeed * delta);
                    const nx = b.x * cosA - b.y * sinA;
                    const ny = b.x * sinA + b.y * cosA;
                    b.x = nx;
                    b.y = ny;
                }

                b.mesh.position.set(b.x, b.y, b.z);

                // Deactivate conditions: bubble rises out of drum ceiling or floats outside boundaries
                const dist = Math.sqrt(b.x*b.x + b.y*b.y);
                const popLimit = 0.70; // pop near drum wall
                const indexThresholdToPop = (index >= activeMax);

                if (dist > popLimit || b.y > 0.65 || indexThresholdToPop) {
                    // Pop / fade out bubble
                    b.isActive = false;
                    b.mesh.scale.set(0.001, 0.001, 0.001);
                }
            } else {
                b.mesh.scale.set(0.001, 0.001, 0.001);
            }
        });
    }
}
// Bind class to window
window.LaundryWasher = LaundryWasher;
