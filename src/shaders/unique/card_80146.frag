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

// Вестник Архааля: venom pours from the painted dragon's jaws, the
// woman's diamond talisman curses, and the existing ward sheds its edge.
// All landmarks use normalized top-left scan coordinates.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.35,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));
}
vec2 wardPath(float s) {
    return vec2(0.022+0.295*s*s,0.321+0.218*s);
}

void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1731)*6.2831853;
    float art=smoothstep(0.140,0.157,p.y)*(1.0-smoothstep(0.538,0.558,p.y));
    art*=smoothstep(0.015,0.032,p.x)*(1.0-smoothstep(0.971,0.990,p.x));
    // Exact original shield badges, including the lower badge's counter.
    art*=smoothstep(1.0,1.16,length((p-vec2(0.108,0.181))/vec2(0.065,0.044)));
    art*=smoothstep(1.0,1.15,length((p-vec2(0.108,0.263))/vec2(0.066,0.046)));
    art*=smoothstep(1.0,1.15,length((p-vec2(0.150,0.287))/vec2(0.030,0.025)));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    float luminance=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));

    // The venom has a fixed origin at the lower jaw. Two slender vortices
    // widen downwards into the green smoke already present in the painting.
    float fall=clamp((p.y-0.363)/0.174,0.0,1.0);
    float plume=smoothstep(0.361,0.377,p.y)*(1.0-smoothstep(0.519,0.544,p.y));
    float streamX=0.850+0.015*sin(fall*8.0-t*1.7+seed)*fall;
    float width=0.007+fall*0.061;
    float haze=exp(-pow((p.x-streamX)/width,2.0))*plume;
    float curl=0.5+0.5*sin(fall*27.0-t*3.0+sin((p.x-streamX)*72.0+seed)*2.1);
    float vapor=haze*(0.20+0.80*curl);
    color*=1.0-vapor*0.10;
    color+=(1.0-color)*vec3(0.28,0.53,0.025)*vapor*0.39;
    float filament=0.0;
    for (int j=0;j<2;j++) {
        float side=float(j)*2.0-1.0;
        float axis=streamX+side*(0.003+0.024*fall)*sin(fall*15.0-t*2.1+seed);
        filament+=(1.0-smoothstep(0.0008,0.0021+aa,abs(p.x-axis)))*plume;
    }
    color+=vec3(0.24,0.41,0.035)*filament*(0.25+0.45*curl);
    float throat=oval(p,vec2(0.848,0.360),vec2(0.037,0.018));
    color+=(1.0-color)*vec3(0.51,0.39,0.025)*throat*(0.20+0.30*sin(t*2.1+seed)*sin(t*2.1+seed));

    // The diamond-shaped talisman carries a second, slower curse rhythm.
    // Its doubled outline and four short barbs stay clear of face and hands.
    vec2 q=(p-vec2(0.507,0.401))*vec2(1.0,1.4113);
    float diamond=abs(q.x)+abs(q.y)*0.73;
    float pulse=0.5+0.5*sin(t*1.35+seed);
    float curse=1.0-smoothstep(0.0008,0.0021+aa,abs(diamond-0.031));
    curse+=0.55*(1.0-smoothstep(0.0006,0.0015+aa,abs(diamond-0.043)));
    float barbs=(1.0-smoothstep(0.0010,0.0020+aa,min(abs(q.x),abs(q.y))))
               *smoothstep(0.031,0.037,length(q))*(1.0-smoothstep(0.048,0.055,length(q)));
    float pendant=oval(p,vec2(0.507,0.400),vec2(0.044,0.042));
    color*=1.0-pendant*0.12*pulse;
    color+=vec3(0.16,0.39,0.21)*(curse+barbs)*(0.18+0.55*pulse);

    // Curse removes protection: a packet runs along the existing left ward,
    // erodes a short section, and sheds gold-green flecks toward the wing.
    float rim=0.0;
    float corrosion=0.0;
    float flakes=0.0;
    float head=fract(t*0.135+seed*0.09);
    for (int i=0;i<24;i++) {
        float s=float(i)/24.0;
        vec2 a=wardPath(s);
        vec2 b=wardPath(s+1.0/24.0);
        float d=segment(p*vec2(1.0,1.4113),a*vec2(1.0,1.4113),b*vec2(1.0,1.4113));
        float delta=fract(s-head+0.5)-0.5;
        float bite=exp(-delta*delta/0.006);
        float jag=0.35+0.65*step(0.44,fract(s*107.3+seed));
        rim=max(rim,(1.0-smoothstep(0.0007,0.0016+aa,d))*(1.0-bite)*jag);
        corrosion=max(corrosion,exp(-d*d/0.00009)*bite);
        float age=fract(t*0.23+s*5.71+seed*0.08);
        vec2 c=a+vec2(0.017+age*0.050,-age*0.018);
        c+=vec2(sin(s*41.0+seed),cos(s*33.0+seed))*age*0.007;
        float fd=length((p-c)*vec2(1.0,1.4113));
        flakes+=(1.0-smoothstep(0.0010,0.0023+aa,fd))*sin(age*3.14159265)*bite;
    }
    color*=1.0-corrosion*0.32;
    color+=vec3(0.08,0.28,0.23)*rim*0.52;
    color+=vec3(0.42,0.51,0.055)*flakes;
    color+=(1.0-color)*vec3(0.24,0.32,0.015)*corrosion*0.26;

    if (u_is_foil) {
        // Blue dragon armor and wing membranes take an etched metal finish.
        // Printed ink luminance controls the shine so scales retain their depth.
        float headMask=oval(p,vec2(0.807,0.257),vec2(0.189,0.145));
        float wing=oval(p,vec2(0.225,0.423),vec2(0.169,0.147));
        float blue=smoothstep(0.005,0.17,scan.b-scan.r*0.85);
        float gold=smoothstep(0.02,0.20,scan.r-scan.b)*headMask;
        float metal=clamp((headMask+wing)*blue+gold*0.85+pendant*0.70,0.0,1.0);
        metal*=smoothstep(0.045,0.26,luminance);
        float phase=p.x*3.3-p.y*4.9-t*0.18+seed*0.08;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float shine=pow(0.5+0.5*sin(phase*6.2831853),12.0);
        float engraving=0.5+0.5*sin(p.x*147.0+p.y*113.0+sin(p.y*75.0)*1.8);
        color*=1.0-metal*(0.13+0.07*engraving);
        color+=(1.0-color)*mix(vec3(0.66,0.88,0.95),spectrum,0.62)
              *metal*(0.16+0.74*shine)*(0.78+0.22*engraving);
        color+=spectrum*filament*0.10;
        // Low-strength foil substrate remains recognizable at compact size;
        // the card-specific metallic details above keep their stronger highlights.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*color*finishHue,
            1.0-2.0*(1.0-color)*(1.0-finishHue),step(vec3(0.5),color));
        color = mix(color,finishOverlay,0.25);

    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
