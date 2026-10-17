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

// Трибун: the commander sets a rightward charge; three successive hoof strikes
// drive golden shock fronts through the dust under his rearing warhorse.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.65,1.0,length((p-c)/r));
}
float hash(float n) { return fract(sin(n*127.1+31.7)*43758.5453); }
float line(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(1.0,min(u_resolution.x,u_resolution.y));
    float t=u_time;
    float seed=u_seed*0.113;
    float art=smoothstep(0.141,0.156,p.y)*(1.0-smoothstep(0.541,0.555,p.y));
    art*=smoothstep(0.009,0.026,p.x)*(1.0-smoothstep(0.974,0.992,p.x));
    // Leave both ability discs and the attached armor counter untouched.
    art*=clamp(smoothstep(0.180,0.199,p.x)+smoothstep(0.307,0.323,p.y),0.0,1.0);
    float face=oval(p,vec2(0.429,0.218),vec2(0.045,0.053));
    float red=smoothstep(0.06,0.19,scan.r-max(scan.g,scan.b));
    float cape=oval(p,vec2(0.248,0.326),vec2(0.175,0.070))*red;
    float ribbons=oval(p,vec2(0.200,0.407),vec2(0.120,0.034))*red;
    vec2 fabricUV=v_uv;
    float wave=sin(p.x*25.0-t*4.2)+0.45*sin(p.x*44.0-t*6.0);
    fabricUV.y+=0.0055*wave*(cape+ribbons)*art;
    vec3 color=mix(scan.rgb,texture2D(u_card,fabricUV).rgb,clamp(cape+ribbons,0.0,1.0)*art);
    color+=vec3(0.12,0.010,0.004)*cape*(0.5+0.5*sin(p.x*35.0-t*4.2));

    // Wind streaks race along the selected direction, behind rider and horse.
    float silhouette=clamp(oval(p,vec2(0.455,0.332),vec2(0.125,0.183))
                          +oval(p,vec2(0.655,0.287),vec2(0.144,0.147))
                          +oval(p,vec2(0.467,0.451),vec2(0.281,0.084))
                          +oval(p,vec2(0.778,0.438),vec2(0.129,0.062))
                          +cape,0.0,1.0);
    float wind=0.0;
    for (int i=0;i<12;i++) {
        float fi=float(i);
        float age=fract(t*(0.29+hash(fi+8.0)*0.13)+hash(fi+4.0)+seed);
        float cy=0.162+hash(fi+13.0)*0.365;
        float cx=-0.12+age*1.30;
        vec2 head=vec2(cx,cy+0.008*sin(age*6.283+fi));
        float d=line(p,head-vec2(0.105,0.012),head);
        float stroke=1.0-smoothstep(0.0015,0.0035+aa*0.65,d);
        wind+=stroke*sin(age*3.141593)*(0.45+0.55*hash(fi+5.0));
    }
    color+=vec3(0.27,0.33,0.32)*wind*(1.0-silhouette)*0.66;

    // A bright command travels along the actual raised sword into its tip.
    vec2 swordA=vec2(0.490,0.237);
    vec2 swordB=vec2(0.786,0.176);
    float sword=1.0-smoothstep(0.002,0.006+aa*0.5,line(p,swordA,swordB));
    float sweep=fract(t*0.47+seed+0.25);
    vec2 swordHead=mix(swordA,swordB,sweep);
    float bladeFlash=exp(-dot(p-swordHead,p-swordHead)/0.0015);
    color+=vec3(0.55,0.36,0.10)*sword*(0.15+bladeFlash*0.85);

    // Three hoof beats, staggered over the charge: expanding curved fronts
    // below the two raised forehooves, with a visible forward-moving edge.
    float rings=0.0;
    float hoofLight=0.0;
    for (int i=0;i<3;i++) {
        float fi=float(i);
        float age=fract(t*0.42-fi*0.24+seed+0.06);
        vec2 origin=mix(vec2(0.688,0.505),vec2(0.885,0.508),step(0.5,mod(fi,2.0)));
        vec2 center=origin+vec2(age*0.047,age*0.016);
        vec2 q=(p-center)*vec2(1.0,2.5);
        float radius=0.010+age*0.113;
        float edge=1.0-smoothstep(0.0025,0.006+aa,abs(length(q)-radius));
        float lower=smoothstep(-0.014,0.010,p.y-origin.y);
        float envelope=(1.0-smoothstep(0.56,1.0,age))*smoothstep(0.0,0.05,age);
        rings+=edge*lower*envelope;
        hoofLight+=oval(p,origin,vec2(0.028,0.022))*exp(-age*9.0);
    }
    color+=vec3(0.54,0.30,0.065)*rings;
    color+=vec3(0.50,0.28,0.055)*hoofLight;

    // Distinct grains lift from the hooves and stream back through the formation.
    float dust=0.0;
    for (int i=0;i<20;i++) {
        float fi=float(i);
        float age=fract(t*0.34+hash(fi+30.0)+seed);
        float sourceX=mix(0.68,0.88,step(0.5,hash(fi+14.0)));
        vec2 c=vec2(sourceX-age*(0.25+0.20*hash(fi+2.0)),
                    0.523-sin(age*3.141593)*(0.025+0.043*hash(fi+7.0)));
        float d=line(p,c,c+vec2(0.012,0.004));
        float size=0.0015+hash(fi+6.0)*0.0025;
        dust+=(1.0-smoothstep(size,size+aa*0.75,d))*sin(age*3.141593);
    }
    color+=vec3(0.48,0.29,0.075)*dust;

    if (u_is_foil) {
        // Enamel-blue barding and gold armor carry an unmistakable iridescent
        // finish even in the still pose. Preserve the rider's tiny face.
        float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        float gold=smoothstep(0.025,0.18,scan.r-scan.b)*smoothstep(0.17,0.50,luma);
        float blue=smoothstep(0.025,0.13,scan.b-scan.r);
        float armor=oval(p,vec2(0.658,0.297),vec2(0.148,0.145))
                    +oval(p,vec2(0.398,0.362),vec2(0.100,0.126));
        float phase=p.x*2.0+p.y*3.5+t*0.13+seed;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 coated=mix(2.0*color*spectrum,
                       1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        float coat=(0.20+0.25*gold+0.13*blue)*mix(0.65,1.0,clamp(armor,0.0,1.0));
        color=mix(color,coated,coat*(1.0-face));
        float glint=pow(0.5+0.5*sin(p.x*18.0-p.y*25.0-t*1.9),12.0);
        color+=(1.0-color)*(vec3(0.25,0.19,0.06)+spectrum*0.25)*glint
               *(gold+0.30*blue)*(1.0-face);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
