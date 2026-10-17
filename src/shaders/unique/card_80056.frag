#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Лафей, 80/56. Top-left scan coordinates: the raised right hand freezes
// the little captive inside the central ice spire into a faceted artifact.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.65,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 ab=b-a;
    return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0));
}
float frostLine(vec2 p, vec2 a, vec2 b, float aa) {
    return 1.0-smoothstep(0.0009,0.0020+aa,segment(p,a,b));
}
float hash(float n) { return fract(sin(n*127.1+31.7)*43758.5453); }

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=u_time;
    float seed=u_seed*0.139;
    // End before the upper tips of every statistics cartouche. The broad
    // upper-left exclusion preserves both printed defense badges exactly.
    float art=smoothstep(0.138,0.151,p.y)*(1.0-smoothstep(0.548,0.559,p.y));
    art*=smoothstep(0.004,0.018,p.x)*(1.0-smoothstep(0.982,0.996,p.x));
    art*=clamp(smoothstep(0.174,0.193,p.x)+smoothstep(0.295,0.311,p.y),0.0,1.0);
    vec3 color=scan.rgb;
    float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float face=oval(p,vec2(0.482,0.255),vec2(0.091,0.10));
    float iceColor=smoothstep(0.025,0.17,scan.g-scan.r)
                  *smoothstep(0.02,0.16,scan.b-scan.r);
    float spire=oval(p,vec2(0.623,0.416),vec2(0.115,0.205));
    float sideIce=oval(p,vec2(0.939,0.466),vec2(0.10,0.17));

    // Slow crystal growth travels UP the ice already painted in the artwork.
    // The scan itself stays still, including the beard, horns and hands.
    float growth=fract(t*0.145+seed);
    float growthY=mix(0.57,0.22,growth);
    float front=exp(-pow((p.y-growthY)/0.023,2.0));
    float crystal=iceColor*clamp(spire+sideIce*0.65,0.0,1.0);
    color+=vec3(0.015,0.20,0.24)*front*crystal;
    float facets=sin(p.x*112.0-p.y*38.0+sin(p.y*63.0)*0.7);
    color*=1.0+crystal*facets*(0.065+0.045*sin(t*1.1+seed));

    // Veins follow the tall central crystal and its two existing branches.
    float veins=frostLine(p,vec2(0.608,0.545),vec2(0.637,0.378),aa);
    veins+=frostLine(p,vec2(0.637,0.378),vec2(0.624,0.226),aa);
    veins+=frostLine(p,vec2(0.619,0.489),vec2(0.546,0.399),aa);
    veins+=frostLine(p,vec2(0.630,0.424),vec2(0.691,0.341),aa);
    veins+=frostLine(p,vec2(0.637,0.378),vec2(0.676,0.282),aa);
    float conduction=0.20+0.80*exp(-pow((p.y-growthY)/0.045,2.0));
    color+=vec3(0.18,0.56,0.62)*min(veins,1.0)*conduction*spire;

    // Ice shackles descend from the open hand to the captive in the spire.
    // Links remain anchored; sequential highlights imply the spell tightening.
    float bind=0.60+0.40*sin(t*1.25+seed);
    float links=0.0;
    for (int i=0;i<7;i++) {
        float fi=float(i);
        float s=fi/6.0;
        vec2 c=mix(vec2(0.756,0.324),vec2(0.646,0.444),s);
        c.x-=sin(s*3.141593)*0.014;
        vec2 q=p-c;
        q=vec2(q.x*0.74+q.y*0.67,-q.x*0.67+q.y*0.74);
        vec2 radii=vec2(mix(0.009,0.005,mod(fi,2.0)),0.013);
        float edge=abs(length(q/radii)-1.0)*min(radii.x,radii.y);
        float ring=1.0-smoothstep(0.0011,0.0020+aa,edge);
        links+=ring*(0.42+0.58*pow(0.5+0.5*sin(t*2.7-fi*0.9+seed),3.0));
    }
    color=mix(color,vec3(0.26,0.79,0.86),clamp(links*bind*0.63,0.0,0.65));
    // Two crystalline cuffs wrap the small figure's shoulders and lower body.
    float cuffs=0.0;
    for (int i=0;i<2;i++) {
        float fi=float(i);
        vec2 q=(p-vec2(0.642-fi*0.008,0.411+fi*0.054))/vec2(0.032,0.009);
        float edge=abs(length(q)-1.0)*0.009;
        cuffs+=(1.0-smoothstep(0.0008,0.0018+aa,edge))
              *(0.45+0.55*smoothstep(-0.7,0.7,q.y));
    }
    color+=vec3(0.09,0.36,0.41)*cuffs*bind;

    // Instead of death, the trapped silhouette becomes an inert blue stone
    // artifact. A descending mineral boundary leaves angular facets behind.
    float captive=oval(p,vec2(0.636,0.441),vec2(0.039,0.063));
    float petrify=0.5+0.5*sin(t*0.68+seed-1.1);
    float stoneBoundary=0.376+0.142*petrify;
    float stone=captive*(1.0-smoothstep(stoneBoundary-0.008,stoneBoundary+0.008,p.y));
    float facetCell=floor(p.x*210.0)+floor(p.y*150.0)*7.0;
    float facetTone=0.82+0.28*hash(facetCell);
    vec3 mineral=vec3(0.60,0.73,0.77)*luma*facetTone;
    color=mix(color,mineral,stone*0.72);
    float stoneRim=exp(-pow((p.y-stoneBoundary)/0.0035,2.0))*captive;
    color+=vec3(0.12,0.41,0.45)*stoneRim;

    // A few ice chips lift from the spell's central spire, away from the face.
    float chips=0.0;
    for (int i=0;i<14;i++) {
        float fi=float(i)+1.0;
        float age=fract(t*(0.10+hash(fi)*0.06)+hash(fi+seed+8.0));
        vec2 c=vec2(0.60+hash(fi+3.0)*0.14+sin(fi+t*0.6)*age*0.016,
                    0.53-age*0.30);
        vec2 q=p-c;
        float d=abs(q.x)*0.85+abs(q.y)*0.60;
        float radius=0.0014+hash(fi+2.0)*0.0016;
        chips+=(1.0-smoothstep(radius,radius+aa,d))*sin(age*3.141593)
               *radius/(radius+aa*0.4);
    }
    color+=vec3(0.21,0.47,0.52)*chips*(1.0-face);

    if (u_is_foil) {
        // Interference follows crystal facets, with dark silver on the artifact.
        float phase=p.x*2.7-p.y*1.9+t*0.12+seed+facets*0.055;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*spectrum,
                         1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        float coating=(0.13+0.32*crystal+0.15*stone)*(1.0-face*0.9);
        color=mix(color,overlay,coating);
        float glint=pow(0.5+0.5*sin(p.x*24.0-p.y*12.0-t*1.5+seed),18.0);
        color+=(1.0-color)*mix(vec3(0.52,0.81,0.90),spectrum,0.45)
               *glint*(0.18*crystal+0.12*stone+0.17*min(links,1.0))
               *smoothstep(0.08,0.38,luma);
    }
    gl_FragColor=vec4(clamp(mix(scan.rgb,color,art),0.0,1.0),scan.a);
}
