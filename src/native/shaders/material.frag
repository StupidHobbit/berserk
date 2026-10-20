// All coordinates are in logical points: grain and bevels survive DPI changes.
in vec2 v_uv;
out vec4 frag_color;
uniform vec2 u_size;
uniform vec2 u_pointer;
uniform float u_kind;
uniform float u_active;
uniform vec2 u_map_offset;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}

// An original, schematic chart of post-Cataclysm Laar, not a canonical atlas.
// Three noise octaves, analytic glyphs and derivative AA. The CPU supplies one
// slowly drifting offset; no per-fragment animation math or terrain morphing.
float mapHash(vec2 p) {
    vec3 q=fract(vec3(p.xyx)*0.1031);
    q+=dot(q,q.yzx+33.33);
    return fract((q.x+q.y)*q.z);
}
float mapNoise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mapHash(i),mapHash(i+vec2(1,0)),f.x),
               mix(mapHash(i+vec2(0,1)),mapHash(i+vec2(1,1)),f.x),f.y);
}
float mapTerrain(vec2 p) {
    return (mapNoise(p)*0.57+mapNoise(p*2.03+11.7)*0.29
            +mapNoise(p*4.11+37.2)*0.14)-0.5;
}
float mapLine(float distance, float width, float aa) {
    return 1.0-smoothstep(width,width+aa,abs(distance));
}
float mapSegment(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
float mapOval(vec2 p, vec2 center, vec2 radius) {
    return (length((p-center)/radius)-1.0)*min(radius.x,radius.y);
}
float mapFort(vec2 p, float aa) {
    // Small ruined keep, an ink symbol rather than a simulated settlement.
    float wall=max(abs(p.x)-0.009,abs(p.y)-0.007);
    float towers=min(length(p-vec2(-0.009,-0.009)),length(p-vec2(0.009,-0.009)))-0.003;
    return max(mapLine(wall,0.0005,aa),mapLine(towers,0.0004,aa));
}
vec3 laarMap(vec3 paper, vec2 uv, vec2 p) {
    // Fit a fixed chart without stretching its mountains or compass on resize.
    float scale=max(1.0,min(u_size.x/1.65,u_size.y));
    vec2 q=(p-u_size*0.5+u_map_offset)/scale+vec2(0.825,0.5);
    float aa=max(fwidth(q.x),fwidth(q.y));
    float terrain=mapTerrain(q*7.0);
    float coast=min(mapOval(q,vec2(0.75,0.46),vec2(0.57,0.35)),
                    mapOval(q,vec2(1.15,0.66),vec2(0.23,0.23)));
    coast=min(coast,mapOval(q,vec2(0.36,0.73),vec2(0.16,0.13)));
    coast+=terrain*0.105;
    // A western gulf and a pair of remote islands break up the silhouette.
    coast=max(coast,-mapOval(q,vec2(0.24,0.49),vec2(0.23,0.13)));
    coast=min(coast,mapOval(q,vec2(1.45,0.39),vec2(0.055,0.09))+terrain*0.03);
    coast=min(coast,mapOval(q,vec2(0.15,0.78),vec2(0.035,0.065))+terrain*0.025);
    float land=1.0-smoothstep(-aa,aa,coast);
    float inland=1.0-smoothstep(-0.035,-0.008,coast);
    float north=1.0-smoothstep(0.18,0.38,q.y+terrain*0.10);
    float forest=1.0-smoothstep(0.12,0.29,length((q-vec2(0.55,0.55))*vec2(1.0,0.85)));
    float marsh=1.0-smoothstep(0.10,0.24,length((q-vec2(1.10,0.72))*vec2(1.0,1.15)));
    float mountains=(1.0-smoothstep(0.035,0.12,abs(q.x-(0.88+sin(q.y*7.0)*0.10))))
                    *smoothstep(0.12,0.23,q.y)*(1.0-smoothstep(0.66,0.79,q.y));

    // Transparent, desaturated washes keep all foreground text legible.
    vec3 c=mix(paper,vec3(0.57,0.62,0.55),0.075*(1.0-land));
    c=mix(c,vec3(0.43,0.45,0.37),0.055*forest*inland);
    c=mix(c,vec3(0.47,0.48,0.39),0.06*marsh*inland);
    c=mix(c,vec3(0.40,0.37,0.36),0.085*north*land);
    vec3 ink=vec3(0.36,0.29,0.20);
    float coastAA=max(fwidth(coast),aa*0.35);
    float lines=mapLine(coast,0.00065,coastAA)*0.20;
    lines+=mapLine(coast-0.010,0.00035,coastAA)*0.075;
    lines+=mapLine(coast-0.022,0.00030,coastAA)*0.045;

    // One local glyph per cell. Region masks create stands and mountain chains.
    vec2 grid=q*vec2(46.0,36.0);
    vec2 cell=floor(grid), local=fract(grid)-0.5;
    float seed=mapHash(cell);
    local-=vec2(seed-0.5,mapHash(cell+8.3)-0.5)*0.24;
    float glyphAA=aa*46.0;
    float peak=abs(local.x)*1.20-local.y-0.23;
    float mountain=mapLine(peak,0.018,glyphAA)*(1.0-smoothstep(0.31,0.37,local.y));
    mountain=max(mountain,mapLine(local.x+local.y*0.28,0.011,glyphAA)
                 *smoothstep(-0.23,-0.17,local.y)*(1.0-smoothstep(0.24,0.32,local.y)));
    float tree=mapLine(length((local+vec2(0.0,0.07))*vec2(1.0,0.85))-0.22,0.012,glyphAA);
    tree=max(tree,mapLine(local.x,0.012,glyphAA)*smoothstep(0.12,0.16,local.y)
             *(1.0-smoothstep(0.29,0.34,local.y)));
    float reeds=mapLine(local.x+sin(local.y*5.0)*0.08,0.012,glyphAA)
               *(1.0-smoothstep(0.15,0.27,abs(local.y)));
    float pool=mapLine(local.y-0.29,0.013,glyphAA)*(1.0-smoothstep(0.22,0.34,abs(local.x)));
    lines+=mountain*mountains*inland*0.17;
    lines+=tree*forest*(1.0-mountains)*inland*step(0.28,seed)*0.12;
    lines+=max(reeds,pool)*marsh*inland*step(0.40,seed)*0.12;

    // Scars of the Cataclysm: sparse glass-like facets across the open plains.
    float plains=inland*(1.0-forest)*(1.0-marsh)*(1.0-mountains)*(1.0-north);
    float shards=mapLine(abs(local.x)*0.65+abs(local.y)-0.20,0.009,glyphAA);
    lines+=shards*plains*step(0.83,seed)*0.065;
    // A winding river connects the interior to the southern marshes.
    float riverX=1.05+0.05*sin(q.y*14.0)+0.025*sin(q.y*31.0);
    float river=q.x-riverX;
    lines+=mapLine(river,0.00065,max(fwidth(river),aa))*inland
           *smoothstep(0.35,0.41,q.y)*(1.0-smoothstep(0.77,0.83,q.y))*0.12;
    lines+=max(mapFort(q-vec2(0.76,0.43),aa),mapFort(q-vec2(1.12,0.56),aa))*inland*0.15;

    // An eclipsed sun over the dark north, and a runic-crystal compass at sea.
    vec2 sun=q-vec2(1.02,0.19);
    float sunRadius=length(sun);
    lines+=mapLine(sunRadius-0.025,0.0006,aa)*0.12;
    lines+=mapLine(sun.x+sun.y*0.35,0.0005,aa)*(1.0-smoothstep(0.020,0.024,sunRadius))*0.09;
    vec2 compass=q-vec2(1.46,0.78);
    float circle=length(compass);
    float diamond=abs(compass.x)*1.7+abs(compass.y)-0.050;
    float rose=max(mapLine(circle-0.060,0.00045,aa),mapLine(diamond,0.0006,aa));
    rose=max(rose,mapLine(compass.x,0.00045,aa)*(1.0-smoothstep(0.050,0.075,abs(compass.y))));
    rose=max(rose,mapLine(compass.y,0.00045,aa)*(1.0-smoothstep(0.035,0.075,abs(compass.x))));
    lines+=rose*0.13;
    // Faded folds are part of the chart, not a grid over the interface.
    float fold=min(abs(q.x-0.60),abs(q.y-0.54));
    c+=vec3(0.007)*exp(-fold*800.0);
    c=mix(c,ink,clamp(lines,0.0,0.24));
    float fade=smoothstep(0.06,0.28,uv.y)*(0.65+0.35*smoothstep(0.10,0.42,abs(uv.x-0.5)));
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
