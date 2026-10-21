// All coordinates are in logical points: grain and bevels survive DPI changes.
in vec2 v_uv;
out vec4 frag_color;
uniform vec2 u_size;
uniform vec2 u_pointer;
uniform float u_kind;
uniform float u_active;
uniform vec4 u_map_camera; // world center, view scale, heading
uniform vec3 u_map_seed; // fixed for the lifetime of this app instance
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}

// An imagined atlas of Laar, generated only where the camera looks. Every
// feature is a pure function of world position and seed: travel reveals new geography,
// never slides a finite texture or changes terrain underneath existing marks.
float mapHash(vec2 p) {
    vec3 q=fract(vec3(p.xyx)*0.1031+u_map_seed);
    q+=dot(q,q.yzx+33.33);
    return fract((q.x+q.y)*q.z);
}
float mapNoise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mapHash(i),mapHash(i+vec2(1,0)),f.x),
               mix(mapHash(i+vec2(0,1)),mapHash(i+vec2(1,1)),f.x),f.y);
}
float mapTerrain(vec2 p) {
    // Rotated octaves avoid axis-aligned coastlines and repeated little islands.
    mat2 turn=mat2(0.8,-0.6,0.6,0.8);
    float height=0.0, weight=0.52;
    for(int i=0;i<5;i++) {
        height+=weight*mapNoise(p);
        p=turn*p*2.07+vec2(13.1,7.7);
        weight*=0.48;
    }
    return height;
}
float mapLine(float distance, float width, float aa) {
    return 1.0-smoothstep(width,width+aa,abs(distance));
}
float mapCoast(vec2 q) {
    vec2 warp=vec2(mapNoise(q*0.63+4.8),mapNoise(q*0.63+19.2))-0.5;
    return mapTerrain(q*1.65+warp*0.85)-0.47;
}
float mapFort(vec2 p, float aa) {
    float wall=max(abs(p.x)-0.010,abs(p.y)-0.007);
    vec2 towers=abs(p)-vec2(0.011,0.008);
    float tower=max(abs(towers.x),abs(towers.y))-0.003;
    float ink=max(mapLine(wall,0.0007,aa),mapLine(tower,0.0006,aa));
    float gate=max(abs(p.x)-0.0025,abs(p.y-0.005)-0.0035);
    return max(ink,mapLine(gate,0.0006,aa));
}
vec3 laarMap(vec3 paper, vec2 uv, vec2 p) {
    // Fixed logical-point scale preserves detail on resize and high-DPI screens.
    // The paper grain, lighting and frame stay still while the atlas moves.
    float angle=u_map_camera.w;
    mat2 camera=mat2(cos(angle),sin(angle),-sin(angle),cos(angle));
    vec2 q=camera*((p-u_size*0.5)/680.0)*u_map_camera.z+u_map_camera.xy;
    float aa=max(length(dFdx(q)),length(dFdy(q)));
    float coast=mapCoast(q);
    float coastAA=max(fwidth(coast),0.0001);
    float land=smoothstep(-coastAA,coastAA,coast);
    float inland=smoothstep(0.012,0.055,coast);
    float climate=mapNoise(q*1.7+vec2(51.3,9.2));
    float ridge=1.0-abs(mapNoise(q*3.2+7.1)*2.0-1.0);
    float mountains=smoothstep(0.65,0.90,ridge)*smoothstep(0.035,0.15,coast);
    float forest=smoothstep(0.48,0.67,climate)*(1.0-mountains)*inland;
    float marsh=(1.0-smoothstep(0.025,0.085,coast))*land*smoothstep(0.57,0.73,climate);

    // Pigment pools in the sea and at the feet of the mountain ranges.
    vec3 c=mix(paper,vec3(0.38,0.51,0.48),(1.0-land)*0.26);
    c=mix(c,vec3(0.31,0.42,0.29),forest*0.13);
    c=mix(c,vec3(0.39,0.42,0.30),marsh*0.15);
    c=mix(c,vec3(0.48,0.35,0.23),mountains*inland*0.13);
    c+=vec3(0.023,0.019,0.012)*smoothstep(0.08,0.25,coast);
    vec3 ink=vec3(0.30,0.25,0.17);
    float lines=mapLine(coast,0.0015,coastAA)*0.48;
    // Multiple irregular bathymetric rings and faint inland elevation contours.
    lines+=mapLine(coast+0.013,0.00065,coastAA)*0.19;
    lines+=mapLine(coast+0.030,0.00055,coastAA)*0.11;
    lines+=mapLine(coast+0.052,0.00045,coastAA)*0.065;
    float contour=abs(fract(coast*45.0)-0.5)/45.0;
    lines+=mapLine(contour,0.00035,coastAA)*inland*(0.035+mountains*0.045);

    // Staggered hand-engraved peaks, with snow notches, shaded faces and foothills.
    vec2 mountainGrid=q*vec2(28.0,25.0);
    mountainGrid.x+=mod(floor(mountainGrid.y),2.0)*0.5;
    vec2 cell=floor(mountainGrid), local=fract(mountainGrid)-0.5;
    float seed=mapHash(cell);
    local-=vec2(seed-0.5,mapHash(cell+8.3)-0.5)*0.19;
    float glyphAA=aa*28.0;
    float peakHeight=mix(0.22,0.36,seed);
    float slope=abs(local.x)*1.5-local.y-peakHeight;
    float base=1.0-smoothstep(0.29,0.35,local.y);
    float peak=mapLine(slope,0.018,glyphAA)*base;
    float face=step(0.0,local.x)*smoothstep(-glyphAA,glyphAA,-slope)*base;
    float hatching=mapLine(fract((local.x-local.y*0.38)*18.0)-0.5,0.08,glyphAA*12.0);
    peak=max(peak,face*hatching*0.44);
    float snow=mapLine(local.y+peakHeight-0.13-abs(local.x)*0.35,0.012,glyphAA)
               *(1.0-smoothstep(0.08,0.13,abs(local.x)));
    peak=max(peak,snow);
    lines+=peak*mountains*inland*0.40;

    // Smaller, independently seeded forests. Mix conifers and round-crowned trees.
    vec2 treeGrid=q*vec2(62.0,56.0);
    treeGrid.x+=mod(floor(treeGrid.y),2.0)*0.5;
    vec2 treeCell=floor(treeGrid), tree=fract(treeGrid)-0.5;
    float treeSeed=mapHash(treeCell+71.0);
    tree-=vec2(treeSeed-0.5,mapHash(treeCell+12.4)-0.5)*0.25;
    float treeAA=aa*62.0;
    float crown=mapLine(length((tree+vec2(0.0,0.08))*vec2(1.0,0.85))-0.22,0.023,treeAA);
    float pine=mapLine(abs(tree.x)*1.65-tree.y-0.30,0.021,treeAA)
               *(1.0-smoothstep(0.18,0.23,tree.y));
    pine=max(pine,mapLine(tree.y-0.20,0.018,treeAA)*(1.0-smoothstep(0.27,0.32,abs(tree.x))));
    float trunk=mapLine(tree.x,0.022,treeAA)*smoothstep(0.10,0.16,tree.y)
                *(1.0-smoothstep(0.30,0.35,tree.y));
    lines+=max(mix(crown,pine,step(0.5,treeSeed)),trunk)*forest*step(0.16,treeSeed)*0.31;
    float reeds=mapLine(abs(tree.x)-0.10+tree.y*0.16,0.015,treeAA)
                *(1.0-smoothstep(0.16,0.27,abs(tree.y)));
    float pool=mapLine(tree.y-0.29,0.018,treeAA)*(1.0-smoothstep(0.23,0.35,abs(tree.x)));
    lines+=max(reeds,pool)*marsh*step(0.38,treeSeed)*0.26;

    // Warped drainage channels narrow towards the highlands; branches join the
    // main valley field and terminate at the shoreline rather than crossing sea.
    vec2 drainage=q*2.1+vec2(mapNoise(q*4.0+31.0),mapNoise(q*4.0+47.0))*0.45;
    float valley=mapNoise(drainage)-0.5;
    float riverAA=max(fwidth(valley),0.0001);
    float riverWidth=mix(0.0045,0.0010,smoothstep(0.02,0.17,coast));
    float river=mapLine(valley,riverWidth,riverAA)*land*(1.0-smoothstep(0.16,0.22,coast));
    float tributary=mapNoise(drainage*2.04+8.1)-0.5;
    river=max(river,mapLine(tributary,0.0012,max(fwidth(tributary),0.0001))
              *(1.0-smoothstep(0.025,0.09,abs(valley)))*inland*(1.0-mountains));
    c=mix(c,vec3(0.32,0.45,0.43),river*0.43);

    // Tiny wave engravings over deeper water, naturally interrupted by islands.
    vec2 seaGrid=q*vec2(24.0,32.0);
    vec2 seaCell=floor(seaGrid), wave=fract(seaGrid)-0.5;
    float waves=mapLine(wave.y-sin(wave.x*9.0)*0.055,0.018,aa*32.0)
                *(1.0-smoothstep(0.24,0.38,abs(wave.x)));
    lines+=waves*(1.0-smoothstep(-0.06,-0.025,coast))*step(0.72,mapHash(seaCell+5.0))*0.13;

    // Trade trails follow broad lowland contours. World-space dashes remain
    // attached to the paper geography as the camera translates and turns.
    float roadField=mapNoise(q*2.8+vec2(81.0,25.0));
    float road=mapLine(roadField-0.5,0.0015,max(fwidth(roadField),0.0001));
    float dash=smoothstep(0.25,0.40,fract((q.x+q.y)*95.0));
    lines+=road*dash*inland*(1.0-mountains)*(1.0-river)*0.19;

    // Stable settlement locations: test terrain at the cell's seed, not at each
    // fragment, so a keep cannot dissolve as it crosses a biome boundary.
    vec2 townCell=floor(q*3.0);
    vec2 townCenter=(townCell+0.22+vec2(mapHash(townCell+18.1),mapHash(townCell+39.7))*0.56)/3.0;
    vec2 town=q-townCenter;
    float settled=0.0;
    // No terrain lookup outside the glyph's footprint. These branches contain
    // no derivatives; all antialiasing footprints were calculated above.
    if(length(town)<0.030) {
        float townCoast=mapCoast(townCenter);
        settled=step(0.025,townCoast)*(1.0-step(0.19,townCoast));
    }
    float townSeed=mapHash(townCell+90.0);
    float fort=mapFort(town,aa);
    float village=mapLine(length(town)-0.004,0.0010,aa);
    village=max(village,mapLine(length(town-vec2(0.009,0.004))-0.002,0.0006,aa));
    float landmark=mix(village,fort,step(0.62,townSeed));
    float halo=1.0-smoothstep(0.016,0.028,length(town));
    // Clear a small patch around the settlement so dense trees don't obscure it.
    lines*=1.0-halo*settled*0.8;
    lines+=landmark*settled*0.60;
    float ring=mapLine(length(town)-0.022,0.0005,aa);
    lines+=ring*settled*step(0.87,townSeed)*0.24;

    // Sparse compass roses etched into ocean charts, also anchored in the world.
    vec2 atlasCell=floor(q/2.4);
    vec2 compass=q-(atlasCell+vec2(0.72,0.64))*2.4;
    float radius=length(compass);
    float ocean=0.0;
    if(radius<0.09) {
        ocean=1.0-smoothstep(-0.08,-0.025,mapCoast((atlasCell+vec2(0.72,0.64))*2.4));
    }
    float rose=mapLine(radius-0.066,0.0007,aa);
    rose=max(rose,mapLine(abs(compass.x)*1.8+abs(compass.y)-0.055,0.0009,aa));
    rose=max(rose,mapLine(abs(compass.y)*1.8+abs(compass.x)-0.055,0.0009,aa));
    rose=max(rose,mapLine(compass.x,0.0006,aa)*(1.0-smoothstep(0.065,0.084,abs(compass.y))));
    rose=max(rose,mapLine(compass.y,0.0006,aa)*(1.0-smoothstep(0.065,0.084,abs(compass.x))));
    lines+=rose*ocean*0.32;

    c=mix(c,ink,clamp(lines,0.0,0.62));
    // A mild screen-space veil keeps small UI text readable without erasing detail.
    float fade=0.64+0.20*smoothstep(0.03,0.35,uv.y);
    return mix(paper,c,fade);
}
void main() {
    vec2 uv=vec2(v_uv.x,1.0-v_uv.y), p=uv*u_size;
    vec2 edge=min(p,u_size-p);
    float rim=min(edge.x,edge.y);
    float fine=noise(p*0.65)-0.5;
    vec3 c;
    if (u_kind < 0.5) {
        // Quarter-sawn walnut: broad growth rings, fine fibres, joinery grooves.
        float warp=noise(vec2(p.x*0.008,p.y*0.018))*22.0;
        float grain=sin(p.y*0.38+warp+sin(p.x*0.007)*2.0);
        float fibres=noise(vec2(p.x*0.018,p.y*0.9));
        c=mix(vec3(0.12,0.067,0.040),vec3(0.28,0.155,0.080),0.5+grain*0.16+fibres*0.3);
        c+=fine*0.035;
        c*=0.8+0.2*sin(uv.y*3.14159);
        c+=vec3(0.12,0.085,0.038)*(1.0-smoothstep(1.0,2.5,rim));
        c*=0.72+0.28*smoothstep(2.0,7.0,rim);
    } else if (u_kind < 1.5) {
        // Worn cartographer's parchment, with the chart beneath the interface.
        float cloud=noise(p*0.009);
        c=mix(vec3(0.81,0.72,0.55),vec3(0.85,0.76,0.60),cloud);
        c+=fine*0.012;
        c=laarMap(c,uv,p);
        float vignette=dot(uv-0.5,uv-0.5);
        c*=1.03-vignette*0.18;
        c*=0.68+0.32*smoothstep(0.0,20.0,rim);
        c+=vec3(0.05,0.035,0.015)*smoothstep(2.0,3.0,rim)*(1.0-smoothstep(3.0,5.0,rim));
    } else if (u_kind < 2.5) {
        // Dyed leather: pebbled surface, shadowed perimeter, double stitching.
        c=vec3(0.105,0.132,0.122)+(noise(p*0.42)-0.5)*0.025;
        c*=0.68+0.32*smoothstep(0.0,18.0,rim);
        float stitch=(1.0-smoothstep(0.4,1.1,abs(rim-7.0)))*step(0.35,fract((p.x+p.y)/7.0));
        c+=vec3(0.20,0.16,0.09)*stitch;
    } else {
        // Cast bronze with a raised edge, directional light and a pressed inset.
        c=mix(vec3(0.20,0.125,0.055),vec3(0.43,0.30,0.13),1.0-uv.y);
        c+=fine*0.025+u_active*vec3(0.10,0.075,0.025);
        float bevel=1.0-smoothstep(1.0,4.0,rim);
        c+=bevel*mix(-0.09,0.16,step(uv.y,0.5));
        c*=0.6+0.4*smoothstep(0.0,1.2,rim);
        float glint=exp(-dot((uv-u_pointer)*vec2(1.0,1.8),(uv-u_pointer)*vec2(1.0,1.8))*5.0);
        c+=u_active*glint*vec3(0.13,0.09,0.03);
    }
    frag_color=vec4(c,1.0);
}
